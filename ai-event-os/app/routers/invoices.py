"""
app/routers/invoices.py
───────────────────────
Invoice management endpoints.

GET  /api/v1/invoices                          list invoices (filter by event / status)
POST /api/v1/invoices/generate/{payment_id}    generate invoice from a payment
GET  /api/v1/invoices/{id}/pdf                 download invoice PDF
POST /api/v1/invoices/{id}/send-email          email invoice to payer
GET  /api/v1/invoices/{id}/status              lightweight status check
GET  /api/v1/invoices/{id}                     full invoice detail
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.invoice import (
    InvoiceGenerateRequest,
    InvoiceResponse,
    InvoiceStatusResponse,
    SendEmailRequest,
)
from app.services import invoice_service

router = APIRouter(prefix="/api/v1/invoices", tags=["Invoices"])


# ── GET /api/v1/invoices ───────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[InvoiceResponse],
    summary="List invoices with optional filters",
)
async def list_invoices(
    event_id: Optional[UUID] = Query(None, description="Filter by event UUID"),
    status: Optional[str] = Query(
        None, description="draft | sent | paid | overdue | cancelled"
    ),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await invoice_service.list_invoices(
        db, event_id=event_id, inv_status=status, page=page, limit=limit
    )


# ── POST /api/v1/invoices/generate/{payment_id} ───────────────────────────────
# Must be declared before /{id} routes to avoid ambiguity.

@router.post(
    "/generate/{payment_id}",
    response_model=InvoiceResponse,
    status_code=201,
    summary="Generate a PDF invoice for a payment",
)
async def generate_invoice(
    payment_id: UUID,
    data: InvoiceGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Creates an invoice record with auto-generated number (INV-{YYYY}-{MM}-{seq:04d}).
    TVA of 20 % is applied; HT is back-calculated from the payment TTC amount.
    Returns 409 if an invoice already exists for this payment.
    """
    return await invoice_service.generate_invoice(db, payment_id, data)


# ── GET /api/v1/invoices/{id}/pdf ─────────────────────────────────────────────

@router.get(
    "/{invoice_id}/pdf",
    summary="Download invoice as PDF",
    response_class=Response,
)
async def download_invoice_pdf(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Generates the PDF on-the-fly using ReportLab (A4, professional layout).
    Returns: application/pdf
    """
    inv = await invoice_service.get_invoice(db, invoice_id)
    pdf_bytes = invoice_service.generate_invoice_pdf(inv)
    filename = f"{inv.invoice_number}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── POST /api/v1/invoices/{id}/send-email ─────────────────────────────────────

@router.post(
    "/{invoice_id}/send-email",
    summary="Email invoice to the payer",
)
async def send_invoice_email(
    invoice_id: UUID,
    data: SendEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Sends the invoice by email and marks status as **sent**.
    The optional `email` field overrides the payer's stored address.
    """
    return await invoice_service.send_invoice_email(
        db,
        invoice_id,
        override_email=data.email,
        message=data.message,
    )


# ── GET /api/v1/invoices/{id}/status ──────────────────────────────────────────

@router.get(
    "/{invoice_id}/status",
    response_model=InvoiceStatusResponse,
    summary="Lightweight invoice status check",
)
async def get_invoice_status(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    inv = await invoice_service.get_invoice(db, invoice_id)
    return InvoiceStatusResponse(
        id=inv.id,
        invoice_number=inv.invoice_number,
        status=inv.status,
        amount_ttc_mad=inv.amount_ttc_mad,
        due_date=inv.due_date,
    )


# ── GET /api/v1/invoices/{id} ─────────────────────────────────────────────────

@router.get(
    "/{invoice_id}",
    response_model=InvoiceResponse,
    summary="Get full invoice detail",
)
async def get_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await invoice_service.get_invoice(db, invoice_id)
