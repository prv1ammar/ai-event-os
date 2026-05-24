"""
app/routers/tickets.py
───────────────────────
FastAPI router — ticket issuance, status management, and QR codes.

Endpoints:
  GET    /api/v1/tickets                      list with filters
  POST   /api/v1/tickets                      create ticket manually
  GET    /api/v1/tickets/{id}                 ticket detail
  PUT    /api/v1/tickets/{id}/status          update status
  GET    /api/v1/tickets/{id}/qr.png          QR code PNG image
  POST   /api/v1/tickets/bulk-generate        generate tickets for multiple visitors
"""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.ticket import (
    BulkGenerateRequest,
    BulkGenerateResult,
    TicketCreate,
    TicketResponse,
    TicketStatusUpdate,
)
from app.services import ticket_service

router = APIRouter(prefix="/api/v1/tickets", tags=["Tickets"])


# ── GET /api/v1/tickets ───────────────────────────────────────────────────────

@router.get(
    "",
    response_model=List[TicketResponse],
    summary="List tickets with optional filters",
)
async def list_tickets(
    event_id:     Optional[UUID] = Query(None, description="Filter by event"),
    visitor_type: Optional[str]  = Query(None, description="Filter by visitor type (join with visitors)"),
    ticket_status: Optional[str] = Query(None, alias="status", description="Filter by ticket status"),
    pack:         Optional[str]  = Query(None, description="Filter by ticket pack"),
    page:  int = Query(1,  ge=1,         description="Page number"),
    limit: int = Query(20, ge=1, le=200, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await ticket_service.get_all(
        db, event_id, visitor_type, ticket_status, pack, page, limit
    )


# ── POST /api/v1/tickets/bulk-generate  (BEFORE /{id}) ───────────────────────

@router.post(
    "/bulk-generate",
    response_model=BulkGenerateResult,
    status_code=status.HTTP_201_CREATED,
    summary="Generate tickets for multiple visitors in one call",
)
async def bulk_generate_tickets(
    data: BulkGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Generates one ticket per visitor in `visitor_ids`.
    Visitors that already have a ticket for the event are silently skipped.
    """
    result = await ticket_service.bulk_generate(db, data)
    return BulkGenerateResult(**result)


# ── POST /api/v1/tickets ──────────────────────────────────────────────────────

@router.post(
    "",
    response_model=TicketResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a single ticket manually",
)
async def create_ticket(
    data: TicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """Create one ticket and auto-generate its QR code."""
    return await ticket_service.create(db, data)


# ── GET /api/v1/tickets/{id} ──────────────────────────────────────────────────

@router.get(
    "/{ticket_id}",
    response_model=TicketResponse,
    summary="Ticket detail",
)
async def get_ticket(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await ticket_service.get_by_id(db, ticket_id)


# ── PUT /api/v1/tickets/{id}/status ──────────────────────────────────────────

@router.put(
    "/{ticket_id}/status",
    response_model=TicketResponse,
    summary="Update ticket status (confirmed / cancelled / no_show)",
)
async def update_ticket_status(
    ticket_id: UUID,
    data: TicketStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await ticket_service.update_status(db, ticket_id, data)


# ── GET /api/v1/tickets/{id}/qr.png ──────────────────────────────────────────

@router.get(
    "/{ticket_id}/qr.png",
    summary="Download QR code as PNG",
    responses={200: {"content": {"image/png": {}}}},
)
async def get_ticket_qr(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns the QR code for this ticket as a raw PNG image."""
    png_bytes = await ticket_service.get_qr_png(db, ticket_id)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )
