"""
app/routers/events.py
──────────────────────
FastAPI router — full CRUD for Event entities + stats and dashboard.

Endpoints:
  GET    /api/v1/events                     list with filters
  POST   /api/v1/events                     create (organizer/admin)
  GET    /api/v1/events/{id}                detail
  PUT    /api/v1/events/{id}                update
  DELETE /api/v1/events/{id}                soft-delete (→ cancelled)
  GET    /api/v1/events/{id}/stats          KPI snapshot
  GET    /api/v1/events/{id}/dashboard      full dashboard payload
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.event import (
    EventCreate,
    EventDashboardResponse,
    EventResponse,
    EventStatsResponse,
    EventUpdate,
)
from app.services import event_service

router = APIRouter(prefix="/api/v1/events", tags=["Events"])


# ── GET /api/v1/events ─────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[EventResponse],
    summary="List events with optional filters",
)
async def list_events(
    status: Optional[str] = Query(
        None,
        description="Filter by status: draft | published | ongoing | completed | cancelled",
    ),
    category: Optional[str] = Query(None, description="Filter by event category"),
    year: Optional[int] = Query(None, description="Filter by start year, e.g. 2026"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return a paginated list of events.  Any authenticated user may call this."""
    return await event_service.get_all(db, status, category, year, page, limit)


# ── POST /api/v1/events ────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=EventResponse,
    status_code=201,
    summary="Create a new event (organizer / admin)",
)
async def create_event(
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Create a new event.  Slug is auto-generated from the name if not provided.
    Initial status is always **draft**.  Requires organizer or admin role.
    """
    return await event_service.create(db, data, current_user)


# ── GET /api/v1/events/{event_id} ─────────────────────────────────────────────

@router.get(
    "/{event_id}",
    response_model=EventResponse,
    summary="Get event by ID",
)
async def get_event(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return full details for a single event.  Raises 404 if not found."""
    return await event_service.get_by_id(db, event_id)


# ── PUT /api/v1/events/{event_id} ─────────────────────────────────────────────

@router.put(
    "/{event_id}",
    response_model=EventResponse,
    summary="Update event (organizer / admin)",
)
async def update_event(
    event_id: UUID,
    data: EventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Partially update an event.  All fields are optional — only the provided
    fields are modified (PATCH semantics via PUT).
    """
    return await event_service.update(db, event_id, data)


# ── DELETE /api/v1/events/{event_id} ─────────────────────────────────────────

@router.delete(
    "/{event_id}",
    summary="Soft-delete (archive) an event",
)
async def delete_event(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Soft-delete by setting status to **cancelled**.
    The DB row is NOT removed — use the update endpoint to restore if needed.
    """
    return await event_service.delete(db, event_id)


# ── GET /api/v1/events/{event_id}/stats ───────────────────────────────────────

@router.get(
    "/{event_id}/stats",
    response_model=EventStatsResponse,
    summary="Event KPI snapshot",
)
async def get_event_stats(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Return key performance indicators:
    total visitors, exhibitors, revenue (MAD), leads, confirmed visitors,
    and booth occupancy rate (0.0 – 1.0).
    """
    stats = await event_service.get_stats(db, event_id)
    return EventStatsResponse(**stats)


# ── GET /api/v1/events/{event_id}/dashboard ───────────────────────────────────

@router.get(
    "/{event_id}/dashboard",
    response_model=EventDashboardResponse,
    summary="Full organiser dashboard",
)
async def get_event_dashboard(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Comprehensive dashboard for organisers:
    event info + KPIs + 5 most-recent exhibitors + 5 upcoming sessions.
    """
    data = await event_service.get_dashboard(db, event_id)
    return EventDashboardResponse(
        event=EventResponse.model_validate(data["event"]),
        stats=EventStatsResponse(**data["stats"]),
        recent_exhibitors=data["recent_exhibitors"],
        upcoming_sessions=data["upcoming_sessions"],
    )
