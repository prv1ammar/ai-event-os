"""
app/schemas/lead.py
────────────────────
Pydantic v2 schemas for the lead pipeline.

Status flow:
  new → contacted → qualified → opportunity → closed_won | closed_lost

Score thresholds (calculated in lead_service.calculate_lead_score):
  0-30  → new
  31-55 → contacted
  56-75 → qualified
  76-100→ opportunity
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

VALID_LEAD_STATUSES = {
    "new", "contacted", "qualified", "opportunity", "closed_won", "closed_lost",
}


# ── Base ───────────────────────────────────────────────────────────────────────

class LeadBase(BaseModel):
    notes: Optional[str] = None
    budget_range: Optional[str] = None    # e.g. "100k-500k MAD"


# ── Create ─────────────────────────────────────────────────────────────────────

class LeadCreate(LeadBase):
    visitor_id: UUID
    exhibitor_id: UUID
    event_id: UUID
    status: str = "new"

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        if v not in VALID_LEAD_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_LEAD_STATUSES)}")
        return v


# ── Update ─────────────────────────────────────────────────────────────────────

class LeadUpdate(BaseModel):
    """All fields optional — PATCH-style partial update."""
    status: Optional[str] = None
    notes: Optional[str] = None
    score: Optional[int] = None
    budget_range: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in VALID_LEAD_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_LEAD_STATUSES)}")
        return v

    @field_validator("score")
    @classmethod
    def valid_score(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (0 <= v <= 100):
            raise ValueError("score must be between 0 and 100")
        return v


# ── Dedicated status endpoint payload ─────────────────────────────────────────

class LeadStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        if v not in VALID_LEAD_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_LEAD_STATUSES)}")
        return v


# ── Nested brief schemas embedded inside LeadResponse ─────────────────────────

class VisitorBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None


class ExhibitorBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_name: str
    contact_email: str
    sector: Optional[str] = None


# ── Full response ──────────────────────────────────────────────────────────────

class LeadResponse(LeadBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    score: Optional[int] = None
    visitor_id: UUID
    exhibitor_id: UUID
    event_id: UUID
    visitor: Optional[VisitorBrief] = None
    exhibitor: Optional[ExhibitorBrief] = None
    created_at: datetime
    updated_at: datetime


# ── Excel export flat row ──────────────────────────────────────────────────────

class LeadExportRow(BaseModel):
    """Flat structure written as one Excel row."""
    id: str
    visitor_name: str
    visitor_email: str
    visitor_phone: Optional[str] = None
    visitor_company: Optional[str] = None
    exhibitor_name: str
    status: str
    score: Optional[int] = None
    budget_range: Optional[str] = None
    notes: Optional[str] = None
    created_at: str


# ── Funnel / stats ─────────────────────────────────────────────────────────────

class LeadFunnelStats(BaseModel):
    event_id: UUID
    total: int
    by_status: dict[str, int]
    avg_score: float
    top_leads: int    # count with score >= 70


# ── Schedule a meeting directly from a lead ────────────────────────────────────

class ScheduleMeetingFromLead(BaseModel):
    scheduled_at: datetime
    duration_min: int = 30
    notes: Optional[str] = None
