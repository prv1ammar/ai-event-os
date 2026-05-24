"""
app/routers/analytics.py
────────────────────────
Real-time analytics, KPI dashboard, attendance, heatmap and live WebSocket.

All endpoints require authentication. Dashboard and heatmap endpoints
require organizer or admin role.

Routes
──────
GET  /api/v1/analytics/dashboard/{event_id}        — full KPI dashboard
GET  /api/v1/analytics/attendance/{event_id}       — attendance by day
GET  /api/v1/analytics/entries/live/{event_id}     — hourly entry flux (24 h)
GET  /api/v1/analytics/heatmap/{event_id}          — booth activity heatmap
GET  /api/v1/analytics/top-sessions/{event_id}     — most attended sessions
GET  /api/v1/analytics/visitor-types/{event_id}    — visitor type breakdown
GET  /api/v1/analytics/traffic-sources/{event_id}  — marketing channel stats
GET  /api/v1/analytics/financial/{event_id}        — revenue / expense KPIs
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.services import analytics_service

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])


# ── GET /api/v1/analytics/dashboard/{event_id} ────────────────────────────────

@router.get(
    "/dashboard/{event_id}",
    summary="Full analytics dashboard KPIs for an event",
)
async def get_dashboard(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Returns aggregated KPIs:
    - Attendance (total / today / entries)
    - Leads & meetings
    - Revenue, expenses, ROI (MAD)
    - Booth occupancy rate
    - Average lead AI score
    """
    return await analytics_service.get_dashboard_kpis(db, event_id)


# ── GET /api/v1/analytics/attendance/{event_id} ───────────────────────────────

@router.get(
    "/attendance/{event_id}",
    summary="Attendance count grouped by calendar day",
)
async def get_attendance(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns `[{date, count}]` sorted chronologically."""
    return await analytics_service.get_attendance_by_day(db, event_id)


# ── GET /api/v1/analytics/entries/live/{event_id} ────────────────────────────

@router.get(
    "/entries/live/{event_id}",
    summary="Hourly entry flux for the last 24 hours",
)
async def get_live_entries(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns `[{hour: 'HH:00', count}]` for the rolling 24-hour window."""
    return await analytics_service.get_live_entry_flux(db, event_id)


# ── GET /api/v1/analytics/heatmap/{event_id} ─────────────────────────────────

@router.get(
    "/heatmap/{event_id}",
    summary="Floor plan booth activity heatmap",
)
async def get_heatmap(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Returns booth scan counts with activity labels:
    - faible     < 50 scans
    - moyenne    50–149 scans
    - forte      150–299 scans
    - très forte ≥ 300 scans

    Each entry includes grid coordinates (x, y) for the frontend heatmap.
    """
    return await analytics_service.get_floor_plan_heatmap(db, event_id)


# ── GET /api/v1/analytics/top-sessions/{event_id} ────────────────────────────

@router.get(
    "/top-sessions/{event_id}",
    summary="Most attended sessions for an event",
)
async def get_top_sessions(
    event_id: UUID,
    limit: int = Query(10, ge=1, le=50, description="Number of sessions to return"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns sessions sorted by attendee count descending."""
    return await analytics_service.get_top_sessions(db, event_id, limit)


# ── GET /api/v1/analytics/visitor-types/{event_id} ───────────────────────────

@router.get(
    "/visitor-types/{event_id}",
    summary="Visitor count breakdown by type",
)
async def get_visitor_types(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns `{standard, vip, press, speaker, partner, organizer, total}`."""
    return await analytics_service.get_visitor_type_breakdown(db, event_id)


# ── GET /api/v1/analytics/traffic-sources/{event_id} ─────────────────────────

@router.get(
    "/traffic-sources/{event_id}",
    summary="Marketing channel performance (leads & sends per channel)",
)
async def get_traffic_sources(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Returns `[{source, leads_generated, sent_count}]`
    for each campaign channel with status='sent'.
    """
    return await analytics_service.get_traffic_sources(db, event_id)


# ── GET /api/v1/analytics/financial/{event_id} ───────────────────────────────

@router.get(
    "/financial/{event_id}",
    summary="Financial dashboard: revenue vs expenses vs budget (MAD)",
)
async def get_financial(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Returns revenue broken down by source (stands, sponsoring, inscriptions…),
    expenses by category, net profit, ROI %, and budget variance.
    """
    return await analytics_service.get_financial_dashboard(db, event_id)


# ── GET /api/v1/analytics/health ─────────────────────────────────────────────

@router.get("/health", include_in_schema=False)
async def analytics_health():
    return {"module": "analytics", "status": "ok"}
