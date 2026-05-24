"""
app/schemas/exhibitor.py
────────────────────────
Pydantic v2 request/response schemas for the Exhibitor entity.

Status flow:  pending → validated | refused | waiting_payment
Packages:     standard | premium | gold | platinum
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


# ── Base ───────────────────────────────────────────────────────────────────────

class ExhibitorBase(BaseModel):
    company_name: str
    sector: Optional[str] = None
    size: Optional[str] = None          # startup | sme | large | multinational
    contact_name: str
    contact_email: EmailStr
    contact_phone: Optional[str] = None
    country: str = "Morocco"
    website: Optional[str] = None
    logo_url: Optional[str] = None
    package: Optional[str] = "standard" # standard | premium | gold | platinum

    @field_validator("size")
    @classmethod
    def valid_size(cls, v: Optional[str]) -> Optional[str]:
        allowed = {"startup", "sme", "large", "multinational", None}
        if v not in allowed:
            raise ValueError(f"size must be one of {allowed - {None}}")
        return v

    @field_validator("package")
    @classmethod
    def valid_package(cls, v: Optional[str]) -> Optional[str]:
        allowed = {"standard", "premium", "gold", "platinum", None}
        if v not in allowed:
            raise ValueError(f"package must be one of {allowed - {None}}")
        return v


# ── Create ─────────────────────────────────────────────────────────────────────

class ExhibitorCreate(ExhibitorBase):
    event_id: UUID


# ── Update ─────────────────────────────────────────────────────────────────────

class ExhibitorUpdate(BaseModel):
    company_name: Optional[str] = None
    sector: Optional[str] = None
    size: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    country: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    package: Optional[str] = None


# ── Status update ──────────────────────────────────────────────────────────────

class ExhibitorStatusUpdate(BaseModel):
    status: str
    reason: Optional[str] = None        # rejection reason (optional)

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        allowed = {"pending", "validated", "refused", "waiting_payment"}
        if v not in allowed:
            raise ValueError(f"status must be one of {allowed}")
        return v


# ── Response ───────────────────────────────────────────────────────────────────

class BoothReservationBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    booth_id: UUID
    status: str
    price_mad: int
    payment_status: str


class ExhibitorResponse(ExhibitorBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    event_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime
    booth_reservations: list[BoothReservationBrief] = []


# ── Lead summary (for exhibitor leads endpoint) ────────────────────────────────

class LeadSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    status: str
    score: Optional[int] = None
    notes: Optional[str] = None
    budget_range: Optional[str] = None
    visitor_id: UUID
    created_at: datetime
