"""
app/routers/speakers.py
────────────────────────
FastAPI router — Speaker CRUD and session assignment.

Endpoints:
  GET    /api/v1/speakers                        list (filter: event_id)
  POST   /api/v1/speakers                        create speaker
  GET    /api/v1/speakers/{id}                   detail with assigned sessions
  PUT    /api/v1/speakers/{id}                   update speaker
  POST   /api/v1/speakers/{id}/assign            assign speaker to a session
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.speaker import (
    SpeakerAssignRequest,
    SpeakerAssignResponse,
    SpeakerCreate,
    SpeakerResponse,
    SpeakerUpdate,
)
from app.services import speaker_service

router = APIRouter(prefix="/api/v1/speakers", tags=["Speakers"])


# ── GET /api/v1/speakers ──────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[SpeakerResponse],
    summary="List speakers, optionally filtered by event",
)
async def list_speakers(
    event_id: Optional[UUID] = Query(None, description="Filter by event UUID"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await speaker_service.get_all(db, event_id, page, limit)


# ── POST /api/v1/speakers ─────────────────────────────────────────────────────

@router.post(
    "",
    response_model=SpeakerResponse,
    status_code=201,
    summary="Create a new speaker (organizer / admin)",
)
async def create_speaker(
    data: SpeakerCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """Register a speaker for an event.  Session assignment is done separately."""
    return await speaker_service.create(db, data, current_user)


# ── POST /api/v1/speakers/{id}/assign ────────────────────────────────────────
# Defined BEFORE /{speaker_id} to avoid path confusion.

@router.post(
    "/{speaker_id}/assign",
    response_model=SpeakerAssignResponse,
    status_code=201,
    summary="Assign a speaker to a session (organizer / admin)",
)
async def assign_speaker(
    speaker_id: UUID,
    data: SpeakerAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Assign an existing speaker to an existing session.
    Both speaker and session must belong to the **same event**.
    Operation is idempotent — assigning an already-assigned speaker is a no-op.
    """
    result = await speaker_service.assign_to_session(db, speaker_id, data.session_id)
    return SpeakerAssignResponse(**result)


# ── GET /api/v1/speakers/{id} ─────────────────────────────────────────────────

@router.get(
    "/{speaker_id}",
    response_model=SpeakerResponse,
    summary="Get speaker detail with assigned sessions",
)
async def get_speaker(
    speaker_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await speaker_service.get_by_id(db, speaker_id)


# ── PUT /api/v1/speakers/{id} ─────────────────────────────────────────────────

@router.put(
    "/{speaker_id}",
    response_model=SpeakerResponse,
    summary="Update speaker information (organizer / admin)",
)
async def update_speaker(
    speaker_id: UUID,
    data: SpeakerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await speaker_service.update(db, speaker_id, data)
