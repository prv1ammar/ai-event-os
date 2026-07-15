"""
app/routers/analytics.py — Dashboard analytics aggregate endpoint

Aggregates per-event KPIs across the new TybotFlow bases:
  Evenements  → events, sessions
  Participants → visiteurs, exposants
  Revenu      → orders
"""
import asyncio
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])

EVENTS_TABLE_ID = "m3ae0796104dae2e3"      # Evenements base
SESSIONS_TABLE_ID = "mabd59f3b36f4df83"    # Evenements base
VISITEURS_TABLE_ID = "m3b5a520cdf13cc6e"   # Participants base
EXPOSANTS_TABLE_ID = "m0b2dd0eb02083bf3"   # Participants base
ORDERS_TABLE_ID = "m0067719083ff9860"      # Revenu base
LEADS_TABLE_ID = "m78f17b1f5fcb640d"       # CRM base (contacts)

BIG = 500

# Order statuses that count as collected revenue
PAID_STATUSES = {"paid", "partial"}


async def rows_for_event(tybot: TybotClient, table_id: str, event_id: int) -> list[dict]:
    """List rows of a table filtered on events_id, tolerating filter failures."""
    try:
        data = await tybot.list_by_table(
            table_id, {"limit": BIG, "where": f"(events_id,eq,{event_id})"}
        )
        return data.get("list", [])
    except Exception:
        try:
            data = await tybot.list_by_table(table_id, {"limit": BIG})
            return [r for r in data.get("list", []) if str(r.get("events_id", "")) == str(event_id)]
        except Exception:
            return []


@router.get("/dashboard", summary="Dashboard KPIs for one or more events")
async def dashboard(
    event_ids: str = Query(..., description="Comma-separated event ids"),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    try:
        ids = [int(x) for x in event_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="event_ids must be a comma-separated list of integers")
    if not ids:
        raise HTTPException(status_code=400, detail="event_ids is required")

    async def fetch_for_event(eid: int):
        return await asyncio.gather(
            tybot.get_by_table(EVENTS_TABLE_ID, str(eid)),
            rows_for_event(tybot, VISITEURS_TABLE_ID, eid),
            rows_for_event(tybot, EXPOSANTS_TABLE_ID, eid),
            rows_for_event(tybot, SESSIONS_TABLE_ID, eid),
            rows_for_event(tybot, ORDERS_TABLE_ID, eid),
            rows_for_event(tybot, LEADS_TABLE_ID, eid),
        )

    results = await asyncio.gather(*(fetch_for_event(eid) for eid in ids))

    events = [r[0] for r in results if r[0]]
    if not events:
        raise HTTPException(status_code=404, detail="No matching events found")

    visitors = [row for r in results for row in r[1]]
    exhibitors = [row for r in results for row in r[2]]
    sessions = [row for r in results for row in r[3]]
    orders = [row for r in results for row in r[4]]
    leads = [row for r in results for row in r[5]]

    # ── Registration statuses ───────────────────────────────────────────────────
    visitors_by_status = dict(Counter(v.get("registration_status") or "pending" for v in visitors))
    exhibitors_by_status = dict(Counter(e.get("registration_status") or "pending" for e in exhibitors))
    sessions_by_type = dict(Counter(s.get("session_type") or "conference" for s in sessions))
    sessions_by_status = dict(Counter(s.get("status") or "scheduled" for s in sessions))
    orders_by_status = dict(Counter(o.get("status") or "draft" for o in orders))
    orders_by_type = dict(Counter(o.get("order_type") or "billet" for o in orders))

    # ── Revenue (MAD) from orders ───────────────────────────────────────────────
    def _amount(o: dict) -> float:
        try:
            return float(o.get("total") or 0)
        except (TypeError, ValueError):
            return 0.0

    revenue_paid = sum(_amount(o) for o in orders if (o.get("status") or "") in PAID_STATUSES)
    revenue_pending = sum(_amount(o) for o in orders if (o.get("status") or "") == "pending")

    # ── Visitors chart: registrations grouped by day ────────────────────────────
    date_counts: dict[str, int] = {}
    for v in visitors:
        raw = v.get("registration_date") or v.get("created_at") or ""
        date = str(raw)[:10]
        if len(date) == 10 and date[4] == "-":
            date_counts[date] = date_counts.get(date, 0) + 1
    visitors_chart = sorted(
        [{"date": d, "count": c} for d, c in date_counts.items()],
        key=lambda x: x["date"],
    )

    # ── Latest orders (top 5 by amount) ─────────────────────────────────────────
    top_orders = sorted(orders, key=_amount, reverse=True)[:5]
    top_orders = [
        {
            "id": o.get("id"),
            "order_number": o.get("order_number"),
            "total": _amount(o),
            "status": o.get("status"),
            "order_type": o.get("order_type"),
        }
        for o in top_orders
    ]

    return {
        "events": events,
        "kpis": {
            "visitors_total": len(visitors),
            "visitors_confirmed": visitors_by_status.get("confirmed", 0),
            "visitors_arrived": sum(1 for v in visitors if v.get("arrived_at")),
            "exhibitors_total": len(exhibitors),
            "exhibitors_confirmed": exhibitors_by_status.get("confirmed", 0),
            "sessions_total": len(sessions),
            "orders_total": len(orders),
            "orders_paid": orders_by_status.get("paid", 0),
            "leads_total": len(leads),
            "revenue_paid": revenue_paid,
            "revenue_pending": revenue_pending,
            "visitors_by_status": visitors_by_status,
            "exhibitors_by_status": exhibitors_by_status,
            "sessions_by_type": sessions_by_type,
            "sessions_by_status": sessions_by_status,
            "orders_by_status": orders_by_status,
            "orders_by_type": orders_by_type,
        },
        "top_orders": top_orders,
        "visitors_chart": visitors_chart,
    }
