"""
app/schemas/ticket.py
─────────────────────
Pydantic v2 schemas for Ticket CRUD and bulk generation.

Ticket status flow:
  pending → confirmed → no_show
  any     → cancelled
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

# ── Constants ─────────────────────────────────────────────────────────────────

VALID_TICKET_STATUSES = {"confirmed", "pending", "cancelled", "no_show"}


# ── Create ────────────────────────────────────────────────────────────────────

class TicketCreate(BaseModel):
    """Payload to create a single ticket manually."""

    visitor_id: UUID
    event_id: UUID
    pack: Optional[str] = None
    status: str = "pending"

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in VALID_TICKET_STATUSES:
            raise ValueError(
                f"status must be one of {sorted(VALID_TICKET_STATUSES)}"
            )
        return v


# ── Status update ─────────────────────────────────────────────────────────────

class TicketStatusUpdate(BaseModel):
    """Body for PUT /tickets/{id}/status — transitions a ticket's state."""

    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in VALID_TICKET_STATUSES:
            raise ValueError(
                f"status must be one of {sorted(VALID_TICKET_STATUSES)}"
            )
        return v


# ── Bulk generate ─────────────────────────────────────────────────────────────

class BulkGenerateRequest(BaseModel):
    """Generate one ticket per visitor in the provided list."""

    visitor_ids: List[UUID]
    event_id: UUID
    pack: Optional[str] = None


class BulkGenerateResult(BaseModel):
    """Summary returned after bulk ticket generation."""

    generated: int
    skipped: int
    ticket_ids: List[UUID]


# ── Response ──────────────────────────────────────────────────────────────────

class TicketResponse(BaseModel):
    """Full ticket representation returned by all CRUD endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    pack: Optional[str] = None
    status: str
    visitor_id: UUID
    event_id: UUID
    created_at: datetime
    updated_at: datetime
