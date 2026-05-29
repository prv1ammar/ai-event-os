"""
app/schemas/payment.py
──────────────────────
Pydantic v2 request / response schemas for the Payment entity.
All monetary values are in MAD (Moroccan Dirham).

Valid methods  : transfer | card | cash | cmi | cheque
Valid sources  : stands | sponsoring | partenaires | inscriptions | other
Valid statuses : pending | paid | partial | refunded | failed
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ── Allowed values (mirrors the DB Enum) ──────────────────────────────────────

VALID_METHODS: set[str] = {"transfer", "card", "cash", "cmi", "cheque"}
VALID_SOURCES: set[str] = {"stands", "sponsoring", "partenaires", "inscriptions", "other"}
VALID_STATUSES: set[str] = {"paid", "partial", "pending", "refunded", "failed"}
VALID_PAYER_TYPES: set[str] = {"exhibitor", "visitor"}


# ── Request schemas ────────────────────────────────────────────────────────────

class PaymentCreate(BaseModel):
    """Fields accepted when recording a new payment manually."""

    amount_mad: int = Field(..., gt=0, description="Payment amount in MAD (integer, no decimals)")
    method: str = Field(default="transfer", description="Payment method")
    source: str = Field(default="other", description="Revenue source category")
    payer_type: str = Field(..., description="'exhibitor' or 'visitor'")
    payer_id: UUID = Field(..., description="UUID of the exhibitor or visitor")
    event_id: UUID = Field(..., description="UUID of the event")
    reference: Optional[str] = Field(None, max_length=120, description="Bank reference or receipt #")
    notes: Optional[str] = Field(None, description="Free-text notes")

    @field_validator("method")
    @classmethod
    def valid_method(cls, v: str) -> str:
        if v not in VALID_METHODS:
            raise ValueError(f"method must be one of {sorted(VALID_METHODS)}")
        return v

    @field_validator("source")
    @classmethod
    def valid_source(cls, v: str) -> str:
        if v not in VALID_SOURCES:
            raise ValueError(f"source must be one of {sorted(VALID_SOURCES)}")
        return v

    @field_validator("payer_type")
    @classmethod
    def valid_payer_type(cls, v: str) -> str:
        if v not in VALID_PAYER_TYPES:
            raise ValueError(f"payer_type must be one of {sorted(VALID_PAYER_TYPES)}")
        return v


class PaymentStatusUpdate(BaseModel):
    """Used by PUT /{id}/status."""

    status: str = Field(..., description="New payment status")

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_STATUSES)}")
        return v


class RefundRequest(BaseModel):
    """Used by POST /{id}/refund."""

    reason: Optional[str] = Field(None, description="Reason for refund")
    amount_mad: Optional[int] = Field(
        None, gt=0, description="Partial refund amount in MAD; omit for full refund"
    )


# ── Response schema ────────────────────────────────────────────────────────────

class PaymentResponse(BaseModel):
    """Full payment representation returned by GET / POST / PUT endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    amount_mad: int
    method: str
    status: str
    source: Optional[str] = None
    reference: Optional[str] = None
    payer_type: str
    payer_id: UUID
    event_id: UUID
    notes: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
