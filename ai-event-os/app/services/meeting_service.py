"""
app/services/meeting_service.py
────────────────────────────────
Business logic for B2B meeting scheduling.

Status flow:  pending → confirmed → done | cancelled
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lead import Meeting
from app.models.visitor import Visitor
from app.models.exhibitor import Exhibitor
from app.models.event import Event
from app.schemas.meeting import MeetingCreate, MeetingStatusUpdate


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, meeting_id: uuid.UUID) -> Meeting:
    result = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.visitor), selectinload(Meeting.exhibitor))
        .where(Meeting.id == meeting_id)
    )
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Meeting {meeting_id} not found")
    return meeting


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def get_all(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    exhibitor_id: Optional[uuid.UUID],
    visitor_id: Optional[uuid.UUID],
    status_filter: Optional[str],
    page: int,
    limit: int,
) -> list[Meeting]:
    query = (
        select(Meeting)
        .options(selectinload(Meeting.visitor), selectinload(Meeting.exhibitor))
    )
    if event_id:
        query = query.where(Meeting.event_id == event_id)
    if exhibitor_id:
        query = query.where(Meeting.exhibitor_id == exhibitor_id)
    if visitor_id:
        query = query.where(Meeting.visitor_id == visitor_id)
    if status_filter:
        query = query.where(Meeting.status == status_filter)

    query = query.order_by(Meeting.scheduled_at.asc())
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, meeting_id: uuid.UUID) -> Meeting:
    return await _get_or_404(db, meeting_id)


async def create(db: AsyncSession, data: MeetingCreate) -> Meeting:
    # Verify all foreign keys
    for model, fk_id, label in [
        (Event,     data.event_id,     "Event"),
        (Visitor,   data.visitor_id,   "Visitor"),
        (Exhibitor, data.exhibitor_id, "Exhibitor"),
    ]:
        row = await db.execute(select(model).where(model.id == fk_id))
        if row.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} {fk_id} not found")

    meeting = Meeting(
        visitor_id=data.visitor_id,
        exhibitor_id=data.exhibitor_id,
        event_id=data.event_id,
        scheduled_at=data.scheduled_at,
        duration_min=data.duration_min,
        notes=data.notes,
        status="pending",
    )
    db.add(meeting)
    await db.flush()
    return await _get_or_404(db, meeting.id)


async def update_status(
    db: AsyncSession,
    meeting_id: uuid.UUID,
    data: MeetingStatusUpdate,
) -> Meeting:
    meeting = await _get_or_404(db, meeting_id)

    # Guard: cannot un-cancel or un-complete
    if meeting.status in ("done", "cancelled") and data.status not in ("done", "cancelled"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Cannot transition from '{meeting.status}' to '{data.status}'",
        )

    meeting.status = data.status
    await db.flush()
    return await _get_or_404(db, meeting_id)


# ── Calendar view ──────────────────────────────────────────────────────────────

async def get_calendar(db: AsyncSession, event_id: uuid.UUID) -> dict:
    ev = await db.execute(select(Event).where(Event.id == event_id))
    if ev.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Event {event_id} not found")

    result = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.visitor), selectinload(Meeting.exhibitor))
        .where(Meeting.event_id == event_id)
        .order_by(Meeting.scheduled_at.asc())
    )
    meetings = list(result.scalars().all())
    return {"event_id": event_id, "total": len(meetings), "meetings": meetings}
