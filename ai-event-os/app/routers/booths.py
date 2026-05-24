"""
app/routers/booths.py
──────────────────────
FastAPI router — Booth CRUD, reservation flow, and floor-plan view.

Endpoints:
  GET    /api/v1/booths                           list (filter: event_id/zone/status)
  POST   /api/v1/booths                           create booth (admin)
  GET    /api/v1/booths/floor-plan/{event_id}     full floor plan — MUST be before /{id}
  GET    /api/v1/booths/{id}                      booth detail
  PUT    /api/v1/booths/{id}                      update booth
  POST   /api/v1/booths/{id}/reserve              reserve booth for exhibitor

NOTE: The floor-plan route is defined BEFORE /{id} so that the static
      path segment "floor-plan" is never mis-matched as a booth UUID.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.booth import (
    BoothCreate,
    BoothReservationResponse,
    BoothResponse,
    BoothUpdate,
    FloorPlanResponse,
    ReserveBoothRequest,
)
from app.services import booth_service

router = APIRouter(prefix="/api/v1/booths", tags=["Booths"])


# ── GET /api/v1/booths ────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[BoothResponse],
    summary="List booths with optional filters",
)
async def list_booths(
    event_id: Optional[UUID] = Query(None, description="Filter by event"),
    zone: Optional[str] = Query(None, description="Filter by zone name, e.g. 'Hall A'"),
    status: Optional[str] = Query(
        None,
        description="available | reserved | occupied",
    ),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await booth_service.get_all(db, event_id, zone, status, page, limit)


# ── POST /api/v1/booths ───────────────────────────────────────────────────────

@router.post(
    "",
    response_model=BoothResponse,
    status_code=201,
    summary="Create a new booth slot (organizer / admin)",
)
async def create_booth(
    data: BoothCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """Create a booth in an event.  Initial status is always **available**."""
    return await booth_service.create(db, data, current_user)


# ── GET /api/v1/booths/floor-plan/{event_id} ─────────────────────────────────
# IMPORTANT: This route MUST appear before /{booth_id} to avoid path conflicts.

@router.get(
    "/floor-plan/{event_id}",
    response_model=FloorPlanResponse,
    summary="Full floor plan with zone-level occupancy",
)
async def get_floor_plan(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Return a structured floor plan for an event, grouped by zone.
    Each zone includes:
    - Colour code for UI rendering
    - Counts: total / available / reserved / occupied
    - Occupancy percentage
    - Individual booth details (with exhibitor info if reserved/occupied)
    """
    return await booth_service.get_floor_plan(db, event_id)


# ── GET /api/v1/booths/{id} ───────────────────────────────────────────────────

@router.get(
    "/{booth_id}",
    response_model=BoothResponse,
    summary="Get booth detail",
)
async def get_booth(
    booth_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await booth_service.get_by_id(db, booth_id)


# ── PUT /api/v1/booths/{id} ───────────────────────────────────────────────────

@router.put(
    "/{booth_id}",
    response_model=BoothResponse,
    summary="Update booth details (organizer / admin)",
)
async def update_booth(
    booth_id: UUID,
    data: BoothUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await booth_service.update(db, booth_id, data)


# ── POST /api/v1/booths/{id}/reserve ─────────────────────────────────────────

@router.post(
    "/{booth_id}/reserve",
    response_model=BoothReservationResponse,
    status_code=201,
    summary="Reserve booth for a validated exhibitor",
)
async def reserve_booth(
    booth_id: UUID,
    data: ReserveBoothRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Business rules enforced:
    1. Booth must have status **available**.
    2. Exhibitor must have status **validated**.

    On success: booth status → **reserved**, reservation → **pending**.
    Price defaults to the booth's listed `price_mad` if not overridden.
    """
    return await booth_service.reserve(db, booth_id, data)
