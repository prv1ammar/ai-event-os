"""
app/schemas/campaign.py
───────────────────────
Pydantic v2 schemas for marketing campaigns.

Status flow:  draft → scheduled → sending → sent | cancelled
Channels:     email | whatsapp | linkedin | facebook | sms
Audience:     all_visitors | vip | exhibitors | speakers | press | custom
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

VALID_CHANNELS  = {"email", "whatsapp", "linkedin", "facebook", "sms"}
VALID_AUDIENCE  = {"all_visitors", "vip", "exhibitors", "speakers", "press", "custom"}
VALID_STATUSES  = {"draft", "scheduled", "sending", "sent", "cancelled"}


# ── Base ───────────────────────────────────────────────────────────────────────

class CampaignBase(BaseModel):
    name: str
    channel: str = "email"
    audience_type: str = "all_visitors"
    subject: Optional[str] = None        # email subject line
    template_name: Optional[str] = None  # Jinja2 template filename
    scheduled_at: Optional[datetime] = None

    @field_validator("channel")
    @classmethod
    def valid_channel(cls, v: str) -> str:
        if v not in VALID_CHANNELS:
            raise ValueError(f"channel must be one of {sorted(VALID_CHANNELS)}")
        return v

    @field_validator("audience_type")
    @classmethod
    def valid_audience(cls, v: str) -> str:
        if v not in VALID_AUDIENCE:
            raise ValueError(f"audience_type must be one of {sorted(VALID_AUDIENCE)}")
        return v


# ── Create ─────────────────────────────────────────────────────────────────────

class CampaignCreate(CampaignBase):
    event_id: UUID


# ── Update ─────────────────────────────────────────────────────────────────────

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    channel: Optional[str] = None
    audience_type: Optional[str] = None
    subject: Optional[str] = None
    template_name: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None

    @field_validator("channel")
    @classmethod
    def valid_channel(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in VALID_CHANNELS:
            raise ValueError(f"channel must be one of {sorted(VALID_CHANNELS)}")
        return v

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_STATUSES)}")
        return v


# ── Schedule payload ───────────────────────────────────────────────────────────

class CampaignScheduleRequest(BaseModel):
    scheduled_at: datetime


# ── Full response ──────────────────────────────────────────────────────────────

class CampaignResponse(CampaignBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    sent_count: int
    open_rate: Optional[float] = None
    click_count: int = 0
    leads_generated: int = 0
    event_id: UUID
    created_at: datetime
    updated_at: datetime


# ── Per-campaign stats ─────────────────────────────────────────────────────────

class CampaignStatsResponse(BaseModel):
    campaign_id: UUID
    name: str
    channel: str
    status: str
    sent_count: int
    open_rate: Optional[float] = None   # 0.0 – 1.0
    click_count: int = 0
    leads_generated: int = 0
    ctr: Optional[float] = None         # click_count / sent_count


# ── Aggregate stats for an entire event ───────────────────────────────────────

class EventCampaignStats(BaseModel):
    event_id: UUID
    total_campaigns: int
    total_sent: int
    avg_open_rate: Optional[float] = None
    total_leads_generated: int
    campaigns: list[CampaignStatsResponse]
