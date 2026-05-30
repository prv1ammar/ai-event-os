"""
app/routers/analytics.py — Dashboard analytics aggregate endpoint
"""
import asyncio
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])

BIG = 500


async def safe_list(tybot: TybotClient, table: str, params: dict | None = None) -> list[dict]:
    try:
        return await tybot.list(table, params or {"limit": BIG})
    except Exception:
        return []


async def sessions_for_event(tybot: TybotClient, event_id: int) -> list[dict]:
    """Sessions support event_id filtering."""
    try:
        return await tybot.list("sessions", {"limit": BIG, "where": f"(event_id,eq,{event_id})"})
    except Exception:
        rows = await safe_list(tybot, "sessions")
        return [r for r in rows if str(r.get("event_id", "")) == str(event_id)]


@router.get("/dashboard/{event_id}", summary="Dashboard KPIs for one event")
async def dashboard(
    event_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    # ── Fetch all data in parallel ──────────────────────────────────────────────
    events_list, visitors, exhibitors, leads, sessions = await asyncio.gather(
        safe_list(tybot, "events", {"limit": 100}),
        safe_list(tybot, "visitors"),
        safe_list(tybot, "exhibitors"),
        safe_list(tybot, "leads"),
        sessions_for_event(tybot, event_id),
    )

    event = next((e for e in events_list if str(e.get("id")) == str(event_id)), None)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # ── Aggregate with real field names ─────────────────────────────────────────
    visitors_by_type = dict(Counter(v.get("visitor_type", "standard") for v in visitors))
    leads_by_interest = dict(Counter(l.get("interest_level", "warm") for l in leads))
    sessions_by_type = dict(Counter(s.get("type", "conference") for s in sessions))
    sessions_by_status = dict(Counter(s.get("status", "scheduled") for s in sessions))

    scores = [l.get("lead_score") or 0 for l in leads if l.get("lead_score") is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0

    hot_leads = sum(1 for l in leads if l.get("interest_level") == "hot")
    warm_leads = sum(1 for l in leads if l.get("interest_level") == "warm")
    cold_leads = sum(1 for l in leads if l.get("interest_level") == "cold")

    # ── Top 5 exhibitors by annual_revenue ─────────────────────────────────────
    top_exhibitors = sorted(
        exhibitors,
        key=lambda e: e.get("annual_revenue") or 0,
        reverse=True,
    )[:5]

    # ── Visitors chart: group by registration date ──────────────────────────────
    date_counts: dict[str, int] = {}
    for v in visitors:
        raw = v.get("created_at") or ""
        date = str(raw)[:10]
        if len(date) == 10 and date[4] == "-":
            date_counts[date] = date_counts.get(date, 0) + 1

    visitors_chart = sorted(
        [{"date": d, "count": c} for d, c in date_counts.items()],
        key=lambda x: x["date"],
    )

    return {
        "event": event,
        "kpis": {
            "visitors_total": len(visitors),
            "expected_visitors": event.get("expected_visitors") or 0,
            "exhibitors_total": len(exhibitors),
            "expected_exhibitors": event.get("expected_exhibitors") or 0,
            "leads_total": len(leads),
            "hot_leads": hot_leads,
            "warm_leads": warm_leads,
            "cold_leads": cold_leads,
            "sessions_total": len(sessions),
            "avg_lead_score": avg_score,
            "budget": event.get("budget") or 0,
            "visitors_by_type": visitors_by_type,
            "leads_by_interest": leads_by_interest,
            "sessions_by_type": sessions_by_type,
            "sessions_by_status": sessions_by_status,
        },
        "top_exhibitors": top_exhibitors,
        "visitors_chart": visitors_chart,
    }
