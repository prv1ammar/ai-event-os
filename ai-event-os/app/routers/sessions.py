"""
app/routers/sessions.py
────────────────────────
FastAPI router — Session CRUD, visitor registration, and attendance list.

Endpoints:
  GET    /api/v1/sessions                        list (filter: event_id / type / date)
  POST   /api/v1/sessions                        create session
  GET    /api/v1/sessions/{id}                   detail with speaker info
  PUT    /api/v1/sessions/{id}                   update session
  POST   /api/v1/sessions/{id}/register          visitor registers to session
  GET    /api/v1/sessions/{id}/attendance        attendance list
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.session import (
    SessionAttendanceResponse,
    SessionCreate,
    SessionRegistrationRequest,
    SessionRegistrationResponse,
    SessionResponse,
    SessionUpdate,
)
from app.services import session_service

router = APIRouter(prefix="/api/v1/sessions", tags=["Sessions"])


# ── GET /api/v1/sessions ──────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[SessionResponse],
    summary="List sessions with optional filters",
)
async def list_sessions(
    event_id: Optional[UUID] = Query(None, description="Filter by event"),
    session_type: Optional[str] = Query(
        None,
        description="keynote | panel | workshop | roundtable | networking | demo",
    ),
    date: Optional[str] = Query(None, description="ISO date YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await session_service.get_all(db, event_id, session_type, date, page, limit)


# ── POST /api/v1/sessions ─────────────────────────────────────────────────────

@router.post(
    "",
    response_model=SessionResponse,
    status_code=201,
    summary="Create a new session (organizer / admin)",
)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Create a session for an event.
    Optionally pre-assign speakers by providing `speaker_ids`.
    Business rule: `end_time` must be after `start_time`.
    """
    return await session_service.create(db, data, current_user)


# ── GET /api/v1/sessions/{id}/attendance ─────────────────────────────────────
# IMPORTANT: Define before /{session_id} to avoid path ambiguity.

@router.get(
    "/{session_id}/attendance",
    response_model=SessionAttendanceResponse,
    summary="Get attendance list for a session",
)
async def get_session_attendance(
    session_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """Return a paginated list of all visitors registered for this session."""
    data = await session_service.get_attendance(db, session_id, page, limit)
    return SessionAttendanceResponse(**data)


# ── POST /api/v1/sessions/{id}/register ──────────────────────────────────────

@router.post(
    "/{session_id}/register",
    response_model=SessionRegistrationResponse,
    status_code=201,
    summary="Register a visitor to this session",
)
async def register_to_session(
    session_id: UUID,
    data: SessionRegistrationRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Register a visitor for a session.
    - Returns 409 if the session is at capacity.
    - Returns 409 if the visitor is already registered.
    """
    attendance = await session_service.register_visitor(
        db, session_id, data.visitor_id
    )
    return SessionRegistrationResponse(
        session_id=session_id,
        visitor_id=data.visitor_id,
        registered_at=attendance.registered_at,
    )


# ── GET /api/v1/sessions/{id} ─────────────────────────────────────────────────

@router.get(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Get session detail with assigned speakers",
)
async def get_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await session_service.get_by_id(db, session_id)


# ── PUT /api/v1/sessions/{id} ─────────────────────────────────────────────────

@router.put(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Update session details (organizer / admin)",
)
async def update_session(
    session_id: UUID,
    data: SessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await session_service.update(db, session_id, data)
