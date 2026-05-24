"""
app/schemas/landing_page.py
────────────────────────────
Pydantic v2 schemas for event landing pages and visit tracking.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


# ── Base ───────────────────────────────────────────────────────────────────────

class LandingPageBase(BaseModel):
    title: str
    slug: Optional[str] = None
    description: Optional[str] = None
    hero_image_url: Optional[str] = None
    cta_text: str = "S'inscrire maintenant"
    is_active: bool = True


# ── Create ─────────────────────────────────────────────────────────────────────

class LandingPageCreate(LandingPageBase):
    event_id: UUID


# ── Update ─────────────────────────────────────────────────────────────────────

class LandingPageUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    hero_image_url: Optional[str] = None
    cta_text: Optional[str] = None
    is_active: Optional[bool] = None


# ── Response ───────────────────────────────────────────────────────────────────

class LandingPageResponse(LandingPageBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_id: UUID
    visits_count: int
    registrations_count: int
    created_at: datetime
    updated_at: datetime


# ── Stats response ─────────────────────────────────────────────────────────────

class LandingPageStats(BaseModel):
    landing_page_id: UUID
    title: str
    visits_count: int
    registrations_count: int
    conversion_rate: float   # registrations / visits  (0.0 when no visits)
    recent_visits: int       # last 7 days


# ── Pixel / track-visit payload ────────────────────────────────────────────────

class TrackVisitRequest(BaseModel):
    landing_page_id: UUID
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    referrer: Optional[str] = None


class TrackVisitResponse(BaseModel):
    status: str = "tracked"
    visits_count: int
