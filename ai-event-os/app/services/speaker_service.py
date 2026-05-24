"""
app/services/speaker_service.py
─────────────────────────────────
Business logic for Speaker CRUD and session assignment.
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.event import Event
from app.models.session import Session, Speaker
from app.schemas.speaker import SpeakerCreate, SpeakerUpdate


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_speaker_or_404(db: AsyncSession, speaker_id: uuid.UUID) -> Speaker:
    result = await db.execute(
        select(Speaker)
        .options(selectinload(Speaker.sessions))
        .where(Speaker.id == speaker_id)
    )
    speaker = result.scalar_one_or_none()
    if speaker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Speaker {speaker_id} not found",
        )
    return speaker


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def get_all(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    page: int,
    limit: int,
) -> list[Speaker]:
    query = select(Speaker).options(selectinload(Speaker.sessions))

    if event_id:
        query = query.where(Speaker.event_id == event_id)

    query = (
        query
        .order_by(Speaker.last_name.asc(), Speaker.first_name.asc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, speaker_id: uuid.UUID) -> Speaker:
    return await _get_speaker_or_404(db, speaker_id)


async def create(
    db: AsyncSession,
    data: SpeakerCreate,
    current_user,
) -> Speaker:
    # Verify event exists
    ev_result = await db.execute(select(Event).where(Event.id == data.event_id))
    if ev_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {data.event_id} not found",
        )

    speaker = Speaker(
        first_name=data.first_name,
        last_name=data.last_name,
        company=data.company,
        bio=data.bio,
        expertise=data.expertise,
        linkedin_url=data.linkedin_url,
        photo_url=data.photo_url,
        event_id=data.event_id,
    )
    db.add(speaker)
    await db.flush()
    await db.refresh(speaker, ["sessions"])
    return speaker


async def update(
    db: AsyncSession,
    speaker_id: uuid.UUID,
    data: SpeakerUpdate,
) -> Speaker:
    speaker = await _get_speaker_or_404(db, speaker_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(speaker, field, value)
    await db.flush()
    await db.refresh(speaker, ["sessions"])
    return speaker


# ── Assign to session ──────────────────────────────────────────────────────────

async def assign_to_session(
    db: AsyncSession,
    speaker_id: uuid.UUID,
    session_id: uuid.UUID,
) -> dict:
    speaker = await _get_speaker_or_404(db, speaker_id)

    # Verify session exists
    sess_result = await db.execute(
        select(Session)
        .options(selectinload(Session.speakers))
        .where(Session.id == session_id)
    )
    session = sess_result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    # Check both belong to the same event
    if speaker.event_id != session.event_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Speaker and session must belong to the same event",
        )

    # Idempotent: only add if not already assigned
    if speaker not in session.speakers:
        session.speakers.append(speaker)
        await db.flush()

    return {
        "speaker_id": speaker_id,
        "session_id": session_id,
        "message": "Speaker assigned to session successfully",
    }
