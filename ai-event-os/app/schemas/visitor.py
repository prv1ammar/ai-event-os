"""
app/schemas/visitor.py
──────────────────────
Pydantic v2 schemas for Visitor CRUD, CSV import, and journey tracking.

Visitor type enum mirrors the DB enum (visitor_type_enum):
  standard | vip | press | partner | organizer | speaker
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

# ── Shared constants ──────────────────────────────────────────────────────────

VALID_VISITOR_TYPES = {
    "standard", "vip", "press", "partner", "organizer", "speaker",
}


# ── Nested summary schemas (used inside VisitorDetailResponse) ────────────────

class TicketSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    status: str
    pack: Optional[str] = None
    created_at: datetime


class ScanSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scan_type: str
    zone: Optional[str] = None
    scanned_at: datetime


# ── Create ────────────────────────────────────────────────────────────────────

class VisitorCreate(BaseModel):
    """Payload accepted when registering a single visitor."""

    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    type: str = "standard"
    country: str = "Morocco"
    event_id: UUID

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in VALID_VISITOR_TYPES:
            raise ValueError(
                f"type must be one of {sorted(VALID_VISITOR_TYPES)}"
            )
        return v

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


# ── Update (PATCH-style) ──────────────────────────────────────────────────────

class VisitorUpdate(BaseModel):
    """All fields optional — only provided fields are updated."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    type: Optional[str] = None
    country: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_VISITOR_TYPES:
            raise ValueError(
                f"type must be one of {sorted(VALID_VISITOR_TYPES)}"
            )
        return v


# ── Response ──────────────────────────────────────────────────────────────────

class VisitorResponse(BaseModel):
    """Flat visitor representation returned by list and basic CRUD endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    type: str
    country: Optional[str] = None
    event_id: UUID
    created_at: datetime
    updated_at: datetime


class VisitorDetailResponse(VisitorResponse):
    """Full visitor detail: includes linked tickets and scan history."""

    tickets: List[TicketSummary] = []
    qr_scans: List[ScanSummary] = []


# ── Journey ───────────────────────────────────────────────────────────────────

class VisitorJourneyResponse(BaseModel):
    """Ordered list of all QR scans for a visitor — their event journey."""

    visitor_id: UUID
    visitor_name: str
    visitor_type: str
    total_scans: int
    scans: List[ScanSummary]


# ── CSV Import ────────────────────────────────────────────────────────────────

class VisitorImportResult(BaseModel):
    """Result summary returned after a CSV bulk import."""

    imported: int
    skipped: int
    errors: List[str]
    total_rows: int
