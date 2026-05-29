"""
app/schemas/meeting.py
──────────────────────
Pydantic v2 schemas for B2B meeting scheduling.

Status flow:  pending → confirmed → done | cancelled
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

VALID_MEETING_STATUSES = {"pending", "confirmed", "done", "cancelled"}


# ── Create ─────────────────────────────────────────────────────────────────────

class MeetingCreate(BaseModel):
    visitor_id: UUID
    exhibitor_id: UUID
    event_id: UUID
    scheduled_at: datetime
    duration_min: int = 30
    notes: Optional[str] = None


# ── Status update ──────────────────────────────────────────────────────────────

class MeetingStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        if v not in VALID_MEETING_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_MEETING_STATUSES)}")
        return v


# ── Nested brief schemas ───────────────────────────────────────────────────────

class VisitorBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    first_name: str
    last_name: str
    email: str
    company: Optional[str] = None
    role: Optional[str] = None


class ExhibitorBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_name: str
    contact_email: str
    sector: Optional[str] = None


# ── Full response ──────────────────────────────────────────────────────────────

class MeetingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scheduled_at: datetime
    duration_min: int
    status: str
    notes: Optional[str] = None
    visitor_id: UUID
    exhibitor_id: UUID
    event_id: UUID
    visitor: Optional[VisitorBrief] = None
    exhibitor: Optional[ExhibitorBrief] = None
    created_at: datetime
    updated_at: datetime


# ── Calendar view for a whole event ───────────────────────────────────────────

class MeetingCalendarResponse(BaseModel):
    event_id: UUID
    total: int
    meetings: list[MeetingResponse]
