"""
app/schemas/invoice.py
──────────────────────
Pydantic v2 schemas for invoice records.

Number format : INV-{YYYY}-{MM}-{seq:04d}  (e.g. INV-2026-05-0001)
TVA rate      : 20 % — all amounts in MAD (Moroccan Dirham).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

INVOICE_STATUSES: set[str] = {"draft", "sent", "paid", "overdue", "cancelled"}


# ── Request schemas ────────────────────────────────────────────────────────────

class InvoiceGenerateRequest(BaseModel):
    """
    Optional overrides when generating an invoice from a payment.
    If payer fields are omitted the service tries to resolve them from
    the payment's payer record.
    """

    payer_name: Optional[str] = Field(None, max_length=255)
    payer_email: Optional[str] = Field(None, max_length=320)
    payer_company: Optional[str] = Field(None, max_length=255)
    payer_ice: Optional[str] = Field(None, max_length=30, description="Moroccan ICE tax ID")
    payer_address: Optional[str] = None
    description: Optional[str] = Field(None, description="Line-item description; auto-generated if omitted")
    due_days: int = Field(default=30, ge=1, le=365, description="Days until due date")


class SendEmailRequest(BaseModel):
    email: Optional[str] = Field(None, description="Override recipient email address")
    message: Optional[str] = Field(None, description="Optional custom message to include in the email body")


# ── Response schemas ───────────────────────────────────────────────────────────

class InvoiceResponse(BaseModel):
    """Full invoice representation."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    invoice_number: str
    payment_id: Optional[UUID] = None
    event_id: UUID
    payer_name: str
    payer_email: str
    payer_company: Optional[str] = None
    payer_ice: Optional[str] = None
    payer_address: Optional[str] = None
    description: str
    amount_ht_mad: int
    tva_rate: int
    tva_mad: int
    amount_ttc_mad: int
    status: str
    due_date: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class InvoiceStatusResponse(BaseModel):
    """Lightweight status check response."""

    id: UUID
    invoice_number: str
    status: str
    amount_ttc_mad: int
    due_date: Optional[datetime] = None
