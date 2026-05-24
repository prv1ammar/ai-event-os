"""
app/services/session_service.py
─────────────────────────────────
Business logic for Session CRUD, visitor registration, and attendance.

Business rules:
  • Session capacity must not exceed the room capacity.
  • A visitor can only register once per session (unique constraint enforced in DB).
  • get_attendance returns a list of all registered visitors.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.session import Session, Speaker, session_speakers
from app.models.session_attendance import SessionAttendance
from app.models.visitor import Visitor
from app.schemas.session import SessionCreate, SessionUpdate


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_session_or_404(db: AsyncSession, session_id: uuid.UUID) -> Session:
    result = await db.execute(
        select(Session)
        .options(selectinload(Session.speakers))
        .where(Session.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    return session


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def get_all(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    session_type: Optional[str],
    date_filter: Optional[str],        # ISO date string YYYY-MM-DD
    page: int,
    limit: int,
) -> list[Session]:
    query = select(Session).options(selectinload(Session.speakers))

    if event_id:
        query = query.where(Session.event_id == event_id)
    if session_type:
        query = query.where(Session.session_type == session_type)
    if date_filter:
        from sqlalchemy import cast, Date
        query = query.where(cast(Session.start_time, Date) == date_filter)

    query = (
        query
        .order_by(Session.start_time.asc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, session_id: uuid.UUID) -> Session:
    return await _get_session_or_404(db, session_id)


async def create(
    db: AsyncSession,
    data: SessionCreate,
    current_user,
) -> Session:
    from app.models.event import Event

    # Verify event exists
    ev_result = await db.execute(select(Event).where(Event.id == data.event_id))
    if ev_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {data.event_id} not found",
        )

    session = Session(
        title=data.title,
        description=data.description,
        session_type=data.session_type,
        room=data.room,
        capacity=data.capacity,
        start_time=data.start_time,
        end_time=data.end_time,
        event_id=data.event_id,
    )
    db.add(session)
    await db.flush()

    # Pre-assign speakers if provided
    if data.speaker_ids:
        speakers_result = await db.execute(
            select(Speaker).where(Speaker.id.in_(data.speaker_ids))
        )
        speakers = list(speakers_result.scalars().all())
        session.speakers = speakers

    await db.flush()
    await db.refresh(session, ["speakers"])
    return session


async def update(
    db: AsyncSession,
    session_id: uuid.UUID,
    data: SessionUpdate,
) -> Session:
    session = await _get_session_or_404(db, session_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(session, field, value)
    await db.flush()
    await db.refresh(session, ["speakers"])
    return session


# ── Visitor registration ───────────────────────────────────────────────────────

async def register_visitor(
    db: AsyncSession,
    session_id: uuid.UUID,
    visitor_id: uuid.UUID,
) -> SessionAttendance:
    session = await _get_session_or_404(db, session_id)

    # Verify visitor exists
    v_result = await db.execute(select(Visitor).where(Visitor.id == visitor_id))
    visitor = v_result.scalar_one_or_none()
    if visitor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visitor {visitor_id} not found",
        )

    # Capacity check
    if session.capacity is not None:
        count_result = await db.execute(
            select(func.count(SessionAttendance.id))
            .where(SessionAttendance.session_id == session_id)
        )
        current_count: int = count_result.scalar() or 0
        if current_count >= session.capacity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Session '{session.title}' is fully booked (capacity: {session.capacity})",
            )

    # Duplicate check
    dup_result = await db.execute(
        select(SessionAttendance).where(
            SessionAttendance.session_id == session_id,
            SessionAttendance.visitor_id == visitor_id,
        )
    )
    if dup_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Visitor is already registered for this session",
        )

    attendance = SessionAttendance(
        session_id=session_id,
        visitor_id=visitor_id,
        registered_at=datetime.now(timezone.utc),
    )
    db.add(attendance)
    await db.flush()
    await db.refresh(attendance)
    return attendance


async def get_attendance(
    db: AsyncSession,
    session_id: uuid.UUID,
    page: int,
    limit: int,
) -> dict:
    session = await _get_session_or_404(db, session_id)

    attendances_result = await db.execute(
        select(SessionAttendance)
        .where(SessionAttendance.session_id == session_id)
        .order_by(SessionAttendance.registered_at.asc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    attendances = list(attendances_result.scalars().all())

    total_result = await db.execute(
        select(func.count(SessionAttendance.id))
        .where(SessionAttendance.session_id == session_id)
    )
    total: int = total_result.scalar() or 0

    return {
        "session_id": session_id,
        "session_title": session.title,
        "total_registered": total,
        "capacity": session.capacity,
        "attendees": [
            {"visitor_id": a.visitor_id, "registered_at": a.registered_at}
            for a in attendances
        ],
    }
