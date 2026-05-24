"""
app/routers/landing_pages.py
──────────────────────────────
Event landing page configuration + visit tracking pixel.

Route order:
  POST /track-visit   ← no auth, must be before /{id}
  GET  /
  POST /
  GET  /{id}
  PUT  /{id}
  GET  /{id}/stats
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.landing_page import (
    LandingPageCreate,
    LandingPageResponse,
    LandingPageStats,
    LandingPageUpdate,
    TrackVisitRequest,
    TrackVisitResponse,
)
from app.services import landing_page_service

router = APIRouter(prefix="/api/v1/landing-pages", tags=["Landing Pages"])


# ── POST /api/v1/landing-pages/track-visit ────────────────────────────────────
# No authentication — public pixel endpoint.
# Registered FIRST to prevent routing to /{id}.

@router.post(
    "/track-visit",
    response_model=TrackVisitResponse,
    summary="Tracking pixel — record a landing page visit (no auth)",
)
async def track_visit(
    data: TrackVisitRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Called by client-side JS or an `<img>` pixel.
    Increments `visits_count` and stores a `LandingPageVisit` row.
    IP is extracted from `X-Forwarded-For` if not provided in payload.
    """
    # Enrich IP from request if not supplied in body
    if not data.ip_address:
        forwarded = request.headers.get("X-Forwarded-For")
        ip = forwarded.split(",")[0].strip() if forwarded else request.client.host if request.client else None
        data = data.model_copy(update={"ip_address": ip})

    if not data.user_agent:
        ua = request.headers.get("User-Agent")
        data = data.model_copy(update={"user_agent": ua})

    return await landing_page_service.track_visit(db, data)


# ── GET /api/v1/landing-pages ─────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[LandingPageResponse],
    summary="List landing pages (filter by event)",
)
async def list_landing_pages(
    event_id: Optional[UUID] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await landing_page_service.get_all(db, event_id, page, limit)


# ── POST /api/v1/landing-pages ────────────────────────────────────────────────

@router.post(
    "",
    response_model=LandingPageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a landing page configuration for an event",
)
async def create_landing_page(
    data: LandingPageCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Slug is auto-generated from title if not provided.
    Duplicate slugs receive a short random suffix.
    """
    return await landing_page_service.create(db, data)


# ── GET /api/v1/landing-pages/{id} ───────────────────────────────────────────

@router.get(
    "/{page_id}",
    response_model=LandingPageResponse,
    summary="Get landing page detail",
)
async def get_landing_page(
    page_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await landing_page_service.get_by_id(db, page_id)


# ── PUT /api/v1/landing-pages/{id} ───────────────────────────────────────────

@router.put(
    "/{page_id}",
    response_model=LandingPageResponse,
    summary="Update landing page content / settings",
)
async def update_landing_page(
    page_id: UUID,
    data: LandingPageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await landing_page_service.update(db, page_id, data)


# ── GET /api/v1/landing-pages/{id}/stats ─────────────────────────────────────

@router.get(
    "/{page_id}/stats",
    response_model=LandingPageStats,
    summary="Visit stats: total views, registrations, conversion rate, last 7 days",
)
async def landing_page_stats(
    page_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await landing_page_service.get_stats(db, page_id)
