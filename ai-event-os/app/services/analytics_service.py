"""
app/services/analytics_service.py
──────────────────────────────────
Real-time analytics KPI computations for the event dashboard.

All monetary values in MAD (Moroccan Dirham).
Queries are written to be compatible with both PostgreSQL (production)
and SQLite (test suite) — date aggregation is done in Python.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booth import Booth, BoothReservation
from app.models.budget import BudgetCategory, Expense
from app.models.campaign import Campaign
from app.models.event import Event
from app.models.exhibitor import Exhibitor
from app.models.lead import Lead, Meeting
from app.models.payment import Payment
from app.models.session import Session
from app.models.session_attendance import SessionAttendance
from app.models.ticket import QRScan, Ticket
from app.models.visitor import Visitor


# ── Private helpers ────────────────────────────────────────────────────────────

async def _require_event(db: AsyncSession, event_id: uuid.UUID) -> Event:
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found",
        )
    return event


def _activity_level(scans: int) -> str:
    """Classify booth activity level by scan count."""
    if scans < 50:
        return "faible"
    elif scans < 150:
        return "moyenne"
    elif scans < 300:
        return "forte"
    return "très forte"


def _safe_ts(ts: Any) -> datetime | None:
    """Coerce a scan timestamp to an aware datetime (UTC)."""
    if ts is None:
        return None
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts)
        except ValueError:
            return None
    if isinstance(ts, datetime) and ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


# ── Dashboard KPIs ─────────────────────────────────────────────────────────────

async def get_dashboard_kpis(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """
    Full analytics dashboard KPIs:
    attendance, leads, revenue, occupancy, ROI, avg score.
    """
    event = await _require_event(db, event_id)

    # ── Visitor counts ─────────────────────────────────────────────────────────
    total_visitors = (await db.execute(
        select(func.count(Visitor.id)).where(Visitor.event_id == event_id)
    )).scalar() or 0

    # ── Scan counts ────────────────────────────────────────────────────────────
    total_entries = (await db.execute(
        select(func.count(QRScan.id)).where(
            QRScan.event_id == event_id,
            QRScan.scan_type == "entry",
        )
    )).scalar() or 0

    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    entries_today = (await db.execute(
        select(func.count(QRScan.id)).where(
            QRScan.event_id == event_id,
            QRScan.scan_type == "entry",
            QRScan.scanned_at >= today_start,
        )
    )).scalar() or 0

    # ── Leads ─────────────────────────────────────────────────────────────────
    total_leads = (await db.execute(
        select(func.count(Lead.id)).where(Lead.event_id == event_id)
    )).scalar() or 0

    qualified_leads = (await db.execute(
        select(func.count(Lead.id)).where(
            Lead.event_id == event_id,
            Lead.status.in_(["qualified", "opportunity", "closed_won"]),
        )
    )).scalar() or 0

    avg_score = float((await db.execute(
        select(func.coalesce(func.avg(Lead.score), 0)).where(
            Lead.event_id == event_id
        )
    )).scalar() or 0)

    # ── Meetings ──────────────────────────────────────────────────────────────
    meetings_count = (await db.execute(
        select(func.count(Meeting.id)).where(Meeting.event_id == event_id)
    )).scalar() or 0

    # ── Revenue ───────────────────────────────────────────────────────────────
    revenue = float((await db.execute(
        select(func.coalesce(func.sum(Payment.amount_mad), 0)).where(
            Payment.event_id == event_id,
            Payment.status == "paid",
        )
    )).scalar() or 0)

    total_expenses = float((await db.execute(
        select(func.coalesce(func.sum(Expense.amount_mad), 0)).where(
            Expense.event_id == event_id,
            Expense.status == "paid",
        )
    )).scalar() or 0)

    budget_mad = float(event.budget or 0)

    # ── Exhibitors & booths ────────────────────────────────────────────────────
    total_exhibitors = (await db.execute(
        select(func.count(Exhibitor.id)).where(Exhibitor.event_id == event_id)
    )).scalar() or 0

    total_booths = (await db.execute(
        select(func.count(Booth.id)).where(Booth.event_id == event_id)
    )).scalar() or 0

    reserved_booths = (await db.execute(
        select(func.count(Booth.id)).where(
            Booth.event_id == event_id,
            Booth.status.in_(["reserved", "occupied"]),
        )
    )).scalar() or 0

    occupancy_rate = round(
        (reserved_booths / total_booths * 100) if total_booths > 0 else 0.0, 1
    )

    # ── Derived KPIs ──────────────────────────────────────────────────────────
    net_profit = revenue - total_expenses
    roi_percent = round(
        (net_profit / total_expenses * 100) if total_expenses > 0 else 0.0, 1
    )

    return {
        "event_id": str(event_id),
        "event_name": event.name,
        "event_status": event.status,
        "total_visitors": total_visitors,
        "total_entries": total_entries,
        "entries_today": entries_today,
        "total_exhibitors": total_exhibitors,
        "total_leads": total_leads,
        "qualified_leads": qualified_leads,
        "meetings_scheduled": meetings_count,
        "total_revenue_mad": revenue,
        "total_budget_mad": budget_mad,
        "total_expenses_mad": total_expenses,
        "net_profit_mad": net_profit,
        "roi_percent": roi_percent,
        "occupancy_rate": occupancy_rate,
        "avg_lead_score": round(avg_score, 1),
        "total_booths": total_booths,
        "reserved_booths": reserved_booths,
        "capacity": event.capacity or 0,
    }


# ── Attendance by day ──────────────────────────────────────────────────────────

async def get_attendance_by_day(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """Entry scan counts grouped by calendar day (Python-side aggregation)."""
    await _require_event(db, event_id)

    result = await db.execute(
        select(QRScan.scanned_at).where(
            QRScan.event_id == event_id,
            QRScan.scan_type == "entry",
        ).order_by(QRScan.scanned_at)
    )
    scans = result.scalars().all()

    day_counts: dict[str, int] = {}
    for ts in scans:
        ts = _safe_ts(ts)
        if ts:
            day_str = ts.strftime("%Y-%m-%d")
            day_counts[day_str] = day_counts.get(day_str, 0) + 1

    return [{"date": d, "count": c} for d, c in sorted(day_counts.items())]


# ── Live entry flux (last 24 h by hour) ───────────────────────────────────────

async def get_live_entry_flux(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """Entry scan counts for the last 24 hours, grouped by hour."""
    await _require_event(db, event_id)

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    result = await db.execute(
        select(QRScan.scanned_at).where(
            QRScan.event_id == event_id,
            QRScan.scan_type == "entry",
            QRScan.scanned_at >= cutoff,
        ).order_by(QRScan.scanned_at)
    )
    scans = result.scalars().all()

    # Build 24 hour-slots
    now = datetime.now(timezone.utc)
    slots: dict[str, int] = {}
    for h in range(24):
        slot = (now - timedelta(hours=23 - h)).replace(
            minute=0, second=0, microsecond=0
        )
        slots[slot.strftime("%H:00")] = 0

    for ts in scans:
        ts = _safe_ts(ts)
        if ts:
            hour_str = ts.strftime("%H:00")
            if hour_str in slots:
                slots[hour_str] += 1

    return [{"hour": h, "count": c} for h, c in slots.items()]


# ── Floor plan heatmap ─────────────────────────────────────────────────────────

async def get_floor_plan_heatmap(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """
    Booth activity heatmap with scan counts and activity labels.

    Activity levels:
      faible     → < 50 scans
      moyenne    → 50–149 scans
      forte      → 150–299 scans
      très forte → ≥ 300 scans

    The ``zone`` column on ``QRScan`` stores the booth number when
    ``scan_type = 'booth'``.
    """
    await _require_event(db, event_id)

    # All booths for this event with optional exhibitor join
    booths_result = await db.execute(
        select(Booth, BoothReservation, Exhibitor)
        .outerjoin(
            BoothReservation,
            (BoothReservation.booth_id == Booth.id),
        )
        .outerjoin(
            Exhibitor,
            Exhibitor.id == BoothReservation.exhibitor_id,
        )
        .where(Booth.event_id == event_id)
        .order_by(Booth.zone, Booth.number)
    )
    booth_rows = booths_result.all()

    # Scan counts per booth number
    scans_result = await db.execute(
        select(QRScan.zone, func.count(QRScan.id).label("scan_count"))
        .where(
            QRScan.event_id == event_id,
            QRScan.scan_type == "booth",
        )
        .group_by(QRScan.zone)
    )
    scan_counts: dict[str, int] = {
        row[0]: row[1] for row in scans_result if row[0]
    }

    heatmap = []
    for idx, row in enumerate(booth_rows):
        booth: Booth = row[0]
        exhibitor: Exhibitor | None = row[2]
        scans = scan_counts.get(booth.number, 0)

        heatmap.append({
            "booth_id": str(booth.id),
            "booth": booth.number,
            "zone": booth.zone or "General",
            "size_m2": booth.size_m2,
            "scans": scans,
            "activity": _activity_level(scans),
            "exhibitor": exhibitor.company_name if exhibitor else None,
            "exhibitor_id": str(exhibitor.id) if exhibitor else None,
            "status": booth.status,
            "x": idx % 10,
            "y": idx // 10,
        })

    # Sort by scan count descending
    heatmap.sort(key=lambda b: b["scans"], reverse=True)
    return heatmap


# ── Top sessions ───────────────────────────────────────────────────────────────

async def get_top_sessions(
    db: AsyncSession,
    event_id: uuid.UUID,
    limit: int = 10,
) -> list[dict]:
    """Sessions ranked by registration count (SessionAttendance rows)."""
    await _require_event(db, event_id)

    result = await db.execute(
        select(
            Session,
            func.count(SessionAttendance.id).label("attendees"),
        )
        .outerjoin(SessionAttendance, SessionAttendance.session_id == Session.id)
        .where(Session.event_id == event_id)
        .group_by(Session.id)
        .order_by(func.count(SessionAttendance.id).desc())
        .limit(limit)
    )
    rows = result.all()

    return [
        {
            "session_id": str(row[0].id),
            "title": row[0].title,
            "session_type": row[0].session_type,
            "room": row[0].room,
            "start_time": (
                row[0].start_time.isoformat() if row[0].start_time else None
            ),
            "end_time": (
                row[0].end_time.isoformat() if row[0].end_time else None
            ),
            "capacity": row[0].capacity,
            "attendees": row[1],
            "occupancy_pct": round(
                (row[1] / row[0].capacity * 100) if row[0].capacity else 0.0, 1
            ),
        }
        for row in rows
    ]


# ── Visitor type breakdown ─────────────────────────────────────────────────────

async def get_visitor_type_breakdown(
    db: AsyncSession, event_id: uuid.UUID
) -> dict:
    """Count of registered visitors by type."""
    await _require_event(db, event_id)

    result = await db.execute(
        select(Visitor.type, func.count(Visitor.id).label("count"))
        .where(Visitor.event_id == event_id)
        .group_by(Visitor.type)
    )

    breakdown: dict[str, int] = {}
    for row in result:
        breakdown[row[0] or "unknown"] = row[1]

    return {
        "standard": breakdown.get("standard", 0),
        "vip": breakdown.get("vip", 0),
        "press": breakdown.get("press", 0),
        "speaker": breakdown.get("speaker", 0),
        "partner": breakdown.get("partner", 0),
        "organizer": breakdown.get("organizer", 0),
        "total": sum(breakdown.values()),
    }


# ── Traffic sources ────────────────────────────────────────────────────────────

async def get_traffic_sources(
    db: AsyncSession, event_id: uuid.UUID
) -> list[dict]:
    """Marketing channel performance — leads & sends per channel."""
    await _require_event(db, event_id)

    result = await db.execute(
        select(
            Campaign.channel,
            func.sum(Campaign.leads_generated).label("leads"),
            func.sum(Campaign.sent_count).label("sent"),
        )
        .where(Campaign.event_id == event_id, Campaign.status == "sent")
        .group_by(Campaign.channel)
    )

    return [
        {
            "source": row[0],
            "leads_generated": int(row[1] or 0),
            "sent_count": int(row[2] or 0),
        }
        for row in result
    ]


# ── Financial dashboard ────────────────────────────────────────────────────────

async def get_financial_dashboard(
    db: AsyncSession, event_id: uuid.UUID
) -> dict:
    """
    Financial KPIs: revenue by source, expenses by category, ROI.
    All amounts in MAD.
    """
    event = await _require_event(db, event_id)

    # Revenue by source
    revenue_result = await db.execute(
        select(
            Payment.source,
            func.sum(Payment.amount_mad).label("amount"),
        )
        .where(
            Payment.event_id == event_id,
            Payment.status == "paid",
        )
        .group_by(Payment.source)
    )
    revenue_by_source: dict[str, float] = {}
    total_revenue = 0.0
    for row in revenue_result:
        amount = float(row[1] or 0)
        revenue_by_source[row[0]] = amount
        total_revenue += amount

    # Expenses by category
    expense_result = await db.execute(
        select(
            BudgetCategory.name,
            func.sum(Expense.amount_mad).label("amount"),
        )
        .join(Expense, Expense.category_id == BudgetCategory.id)
        .where(
            BudgetCategory.event_id == event_id,
            Expense.status == "paid",
        )
        .group_by(BudgetCategory.name)
    )
    expenses_by_category: dict[str, float] = {}
    total_expenses = 0.0
    for row in expense_result:
        amount = float(row[1] or 0)
        expenses_by_category[row[0]] = amount
        total_expenses += amount

    budget_mad = float(event.budget or 0)
    net_profit = total_revenue - total_expenses
    roi_percent = round(
        (net_profit / total_expenses * 100) if total_expenses > 0 else 0.0, 1
    )
    budget_variance = round(
        ((total_expenses - budget_mad) / budget_mad * 100) if budget_mad > 0 else 0.0, 1
    )

    return {
        "event_id": str(event_id),
        "event_name": event.name,
        "total_revenue_mad": total_revenue,
        "total_expenses_mad": total_expenses,
        "total_budget_mad": budget_mad,
        "net_profit_mad": net_profit,
        "roi_percent": roi_percent,
        "budget_variance_percent": budget_variance,
        "revenue_by_source": revenue_by_source,
        "expenses_by_category": expenses_by_category,
    }


# ── Live snapshot (WebSocket broadcaster) ─────────────────────────────────────

async def get_live_snapshot(
    db: AsyncSession, event_id: uuid.UUID
) -> dict:
    """
    Lightweight real-time snapshot — called every 30 s by the WebSocket
    broadcaster after each QR scan event.
    """
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    entries_today = (await db.execute(
        select(func.count(QRScan.id)).where(
            QRScan.event_id == event_id,
            QRScan.scan_type == "entry",
            QRScan.scanned_at >= today_start,
        )
    )).scalar() or 0

    entries_total = (await db.execute(
        select(func.count(QRScan.id)).where(
            QRScan.event_id == event_id,
            QRScan.scan_type == "entry",
        )
    )).scalar() or 0

    leads_scanned = (await db.execute(
        select(func.count(Lead.id)).where(Lead.event_id == event_id)
    )).scalar() or 0

    total_booths = (await db.execute(
        select(func.count(Booth.id)).where(Booth.event_id == event_id)
    )).scalar() or 0

    reserved_booths = (await db.execute(
        select(func.count(Booth.id)).where(
            Booth.event_id == event_id,
            Booth.status.in_(["reserved", "occupied"]),
        )
    )).scalar() or 0

    occupancy_rate = round(
        (reserved_booths / total_booths * 100) if total_booths > 0 else 0.0, 1
    )

    # Top 5 booths by scan count
    top_booths_result = await db.execute(
        select(QRScan.zone, func.count(QRScan.id).label("scans"))
        .where(
            QRScan.event_id == event_id,
            QRScan.scan_type == "booth",
        )
        .group_by(QRScan.zone)
        .order_by(func.count(QRScan.id).desc())
        .limit(5)
    )
    top_booths = [
        {"booth": row[0], "scans": row[1]}
        for row in top_booths_result
        if row[0]
    ]

    # Last 8 hours entry flux
    flux_cutoff = datetime.now(timezone.utc) - timedelta(hours=8)
    flux_result = await db.execute(
        select(QRScan.scanned_at).where(
            QRScan.event_id == event_id,
            QRScan.scan_type == "entry",
            QRScan.scanned_at >= flux_cutoff,
        )
    )
    flux_scans = flux_result.scalars().all()

    now = datetime.now(timezone.utc)
    flux_slots: dict[str, int] = {}
    for h in range(8):
        slot = (now - timedelta(hours=7 - h)).replace(
            minute=0, second=0, microsecond=0
        )
        flux_slots[slot.strftime("%H:00")] = 0

    for ts in flux_scans:
        ts = _safe_ts(ts)
        if ts:
            hour_str = ts.strftime("%H:00")
            if hour_str in flux_slots:
                flux_slots[hour_str] += 1

    # Visitor type breakdown
    vtype_result = await db.execute(
        select(Visitor.type, func.count(Visitor.id).label("count"))
        .where(Visitor.event_id == event_id)
        .group_by(Visitor.type)
    )
    visitor_type_breakdown = {row[0]: row[1] for row in vtype_result if row[0]}

    return {
        "type": "dashboard_update",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_id": str(event_id),
        "entries_today": entries_today,
        "entries_total": entries_total,
        "leads_scanned": leads_scanned,
        "occupancy_rate": occupancy_rate,
        "top_booths": top_booths,
        "entry_flux": [{"hour": h, "count": c} for h, c in flux_slots.items()],
        "visitor_type_breakdown": visitor_type_breakdown,
    }
