"""
app/schemas/event.py
────────────────────
Pydantic v2 request/response schemas for the Event entity.

Status flow enforced at the service layer:
  draft → published → ongoing → completed
  any → cancelled  (soft-delete / archive)
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


# ── Base ───────────────────────────────────────────────────────────────────────

class EventBase(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: date
    end_date: date
    venue: Optional[str] = None
    city: Optional[str] = None
    country: str = "Morocco"
    capacity: Optional[int] = None
    category: Optional[str] = None
    logo_url: Optional[str] = None

    @model_validator(mode="after")
    def end_after_start(self) -> "EventBase":
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


# ── Create ─────────────────────────────────────────────────────────────────────

class EventCreate(EventBase):
    """Fields accepted when POSTing a new event."""
    slug: Optional[str] = None          # auto-generated from name if omitted
    budget_mad: Optional[float] = None  # event budget in MAD

    @field_validator("slug", mode="before")
    @classmethod
    def sanitise_slug(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return v.strip().lower().replace(" ", "-")
        return v


# ── Update ─────────────────────────────────────────────────────────────────────

class EventUpdate(BaseModel):
    """All fields optional — PATCH-style partial update."""
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    venue: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[str] = None
    category: Optional[str] = None
    budget_mad: Optional[float] = None
    logo_url: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: Optional[str]) -> Optional[str]:
        allowed = {"draft", "published", "ongoing", "completed", "cancelled"}
        if v and v not in allowed:
            raise ValueError(f"status must be one of {allowed}")
        return v


# ── Response ───────────────────────────────────────────────────────────────────

class EventResponse(BaseModel):
    """Full event representation returned by all GET/POST/PUT endpoints."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    start_date: date
    end_date: date
    venue: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    capacity: Optional[int] = None
    status: str
    category: Optional[str] = None
    budget: Optional[int] = None        # stored as `budget` on the ORM model
    logo_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ── Stats ──────────────────────────────────────────────────────────────────────

class EventStatsResponse(BaseModel):
    """KPI snapshot for a single event."""
    event_id: UUID
    total_visitors: int
    total_exhibitors: int
    total_revenue_mad: float            # sum of confirmed payments
    total_leads: int
    confirmed_visitors: int             # visitors with a confirmed ticket
    occupancy_rate: float               # 0.0 – 1.0 (reserved+occupied / total booths)


# ── Dashboard ──────────────────────────────────────────────────────────────────

class ExhibitorSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_name: str
    status: str
    package: Optional[str] = None


class SessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    session_type: str
    start_time: datetime
    room: Optional[str] = None


class EventDashboardResponse(BaseModel):
    """Full organiser dashboard — event + KPIs + recent activity."""
    event: EventResponse
    stats: EventStatsResponse
    recent_exhibitors: list[ExhibitorSummary]
    upcoming_sessions: list[SessionSummary]
