"""
app/routers/meetings.py
────────────────────────
B2B meeting scheduling between visitors and exhibitors.

Route order:
  GET  /calendar/{event_id}   ← literal prefix, must be before /{id}
  GET  /
  POST /
  GET  /{id}
  PUT  /{id}/status
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.meeting import (
    MeetingCalendarResponse,
    MeetingCreate,
    MeetingResponse,
    MeetingStatusUpdate,
)
from app.services import meeting_service

router = APIRouter(prefix="/api/v1/meetings", tags=["Meetings"])


# ── GET /api/v1/meetings/calendar/{event_id} ──────────────────────────────────
# Must be registered BEFORE /{meeting_id} to avoid routing conflict.

@router.get(
    "/calendar/{event_id}",
    response_model=MeetingCalendarResponse,
    summary="All meetings for an event as a calendar view",
)
async def get_meeting_calendar(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns all meetings ordered by `scheduled_at` ascending."""
    return await meeting_service.get_calendar(db, event_id)


# ── GET /api/v1/meetings ──────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[MeetingResponse],
    summary="List meetings (filter by event / exhibitor / visitor / status)",
)
async def list_meetings(
    event_id: Optional[UUID] = Query(None),
    exhibitor_id: Optional[UUID] = Query(None),
    visitor_id: Optional[UUID] = Query(None),
    status: Optional[str] = Query(None, description="pending|confirmed|done|cancelled"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await meeting_service.get_all(
        db, event_id, exhibitor_id, visitor_id, status, page, limit
    )


# ── POST /api/v1/meetings ─────────────────────────────────────────────────────

@router.post(
    "",
    response_model=MeetingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule a new B2B meeting",
)
async def create_meeting(
    data: MeetingCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await meeting_service.create(db, data)


# ── GET /api/v1/meetings/{id} ─────────────────────────────────────────────────

@router.get(
    "/{meeting_id}",
    response_model=MeetingResponse,
    summary="Get meeting detail",
)
async def get_meeting(
    meeting_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await meeting_service.get_by_id(db, meeting_id)


# ── PUT /api/v1/meetings/{id}/status ─────────────────────────────────────────

@router.put(
    "/{meeting_id}/status",
    response_model=MeetingResponse,
    summary="Confirm / cancel / complete a meeting",
)
async def update_meeting_status(
    meeting_id: UUID,
    data: MeetingStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Status transitions:
    - **pending → confirmed** — both parties confirmed
    - **confirmed → done**    — meeting took place
    - **any → cancelled**     — cancelled by either party
    """
    return await meeting_service.update_status(db, meeting_id, data)
