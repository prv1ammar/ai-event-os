"""
app/routers/campaigns.py
─────────────────────────
Marketing campaign management: create, send, schedule, track metrics.

Route order:
  GET  /stats/{event_id}   ← literal prefix before /{id}
  GET  /
  POST /
  GET  /{id}
  PUT  /{id}
  POST /{id}/send
  POST /{id}/schedule
  GET  /{id}/stats
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.campaign import (
    CampaignCreate,
    CampaignResponse,
    CampaignScheduleRequest,
    CampaignStatsResponse,
    CampaignUpdate,
    EventCampaignStats,
)
from app.services import campaign_service

router = APIRouter(prefix="/api/v1/campaigns", tags=["Campaigns"])


# ── GET /api/v1/campaigns/stats/{event_id} ─────────────────────────────────────
# Registered FIRST to avoid clashing with /{campaign_id}

@router.get(
    "/stats/{event_id}",
    response_model=EventCampaignStats,
    summary="All campaign performance metrics for an event",
)
async def event_campaign_stats(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await campaign_service.get_event_stats(db, event_id)


# ── GET /api/v1/campaigns ─────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[CampaignResponse],
    summary="List campaigns (filter by event / channel)",
)
async def list_campaigns(
    event_id: Optional[UUID] = Query(None),
    channel: Optional[str] = Query(None, description="email|whatsapp|linkedin|facebook|sms"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await campaign_service.get_all(db, event_id, channel, page, limit)


# ── POST /api/v1/campaigns ────────────────────────────────────────────────────

@router.post(
    "",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new campaign (starts in 'draft' status)",
)
async def create_campaign(
    data: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await campaign_service.create(db, data)


# ── GET /api/v1/campaigns/{id} ────────────────────────────────────────────────

@router.get(
    "/{campaign_id}",
    response_model=CampaignResponse,
    summary="Get campaign detail with current metrics",
)
async def get_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await campaign_service.get_by_id(db, campaign_id)


# ── PUT /api/v1/campaigns/{id} ────────────────────────────────────────────────

@router.put(
    "/{campaign_id}",
    response_model=CampaignResponse,
    summary="Update campaign (not allowed when status is 'sending' or 'sent')",
)
async def update_campaign(
    campaign_id: UUID,
    data: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await campaign_service.update(db, campaign_id, data)


# ── POST /api/v1/campaigns/{id}/send ─────────────────────────────────────────

@router.post(
    "/{campaign_id}/send",
    response_model=CampaignResponse,
    summary="Trigger immediate send to all audience recipients",
)
async def send_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Dispatches individual Celery `send_single_email` tasks per recipient.
    Campaign status transitions: **draft/scheduled → sending → sent**.
    """
    return await campaign_service.send_now(db, campaign_id)


# ── POST /api/v1/campaigns/{id}/schedule ──────────────────────────────────────

@router.post(
    "/{campaign_id}/schedule",
    response_model=CampaignResponse,
    summary="Schedule campaign for a future date/time",
)
async def schedule_campaign(
    campaign_id: UUID,
    data: CampaignScheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """Status transitions: **draft → scheduled**."""
    return await campaign_service.schedule(db, campaign_id, data)


# ── GET /api/v1/campaigns/{id}/stats ─────────────────────────────────────────

@router.get(
    "/{campaign_id}/stats",
    response_model=CampaignStatsResponse,
    summary="Get per-campaign metrics: open rate, CTR, leads generated",
)
async def campaign_stats(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await campaign_service.get_stats(db, campaign_id)
