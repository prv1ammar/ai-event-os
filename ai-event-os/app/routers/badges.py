"""
app/routers/badges.py
──────────────────────
FastAPI router — badge PDF generation and download.

Endpoints:
  GET  /api/v1/badges/{visitor_id}.pdf      download single badge PDF
  POST /api/v1/badges/bulk-generate         download ZIP of all badges for an event
  GET  /api/v1/badges/preview/{type}        preview badge colour palette for a visitor type
"""

from __future__ import annotations

import base64
import io
import zipfile
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.models.event import Event
from app.models.ticket import Ticket
from app.models.visitor import Visitor
from app.services.badge_service import BADGE_COLORS, generate_badge_pdf
from app.services.qr_service import generate_qr_code

router = APIRouter(prefix="/api/v1/badges", tags=["Badges"])


# ── GET /api/v1/badges/preview/{type}  (BEFORE /{visitor_id}.pdf) ────────────

@router.get(
    "/preview/{visitor_type}",
    summary="Preview badge colour palette for a visitor type",
)
async def preview_badge_template(
    visitor_type: str,
    current_user=Depends(get_current_user),
):
    """
    Returns the colour specification used for a given visitor type badge.
    Useful for frontend badge preview rendering.
    """
    palette = BADGE_COLORS.get(visitor_type)
    if palette is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No badge template for type '{visitor_type}'. "
                   f"Valid types: {sorted(BADGE_COLORS.keys())}",
        )
    return {"visitor_type": visitor_type, "colors": palette}


# ── POST /api/v1/badges/bulk-generate  (BEFORE /{visitor_id}.pdf) ────────────

@router.post(
    "/bulk-generate",
    summary="Generate a ZIP archive of all visitor badges for an event",
)
async def bulk_generate_badges(
    event_id: UUID = Query(..., description="Event UUID"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Generates a PDF badge for every visitor of the event who has at least
    one confirmed ticket, then returns a ZIP archive.

    ⚠️  Large events (1 000+ visitors) may take several seconds —
    consider delegating to a Celery task for production use.
    """
    # Load event
    ev_result = await db.execute(select(Event).where(Event.id == event_id))
    event = ev_result.scalar_one_or_none()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found",
        )

    # Load visitors with their first confirmed ticket
    visitors_result = await db.execute(
        select(Visitor).where(Visitor.event_id == event_id)
    )
    visitors = list(visitors_result.scalars().all())

    if not visitors:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No visitors found for this event",
        )

    # Build ZIP in memory
    zip_buffer = io.BytesIO()
    badge_count = 0

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for visitor in visitors:
            # Get first confirmed ticket for QR
            t_result = await db.execute(
                select(Ticket)
                .where(
                    Ticket.visitor_id == visitor.id,
                    Ticket.status == "confirmed",
                )
                .limit(1)
            )
            ticket = t_result.scalar_one_or_none()

            if ticket is None:
                # Visitor has no confirmed ticket — skip
                continue

            qr_bytes = (
                base64.b64decode(ticket.qr_data)
                if ticket.qr_data
                else generate_qr_code(ticket.code, str(ticket.event_id), str(visitor.id))
            )

            pdf_bytes = generate_badge_pdf(visitor, ticket, event, qr_bytes)

            filename = (
                f"{visitor.last_name.upper()}_{visitor.first_name.upper()}"
                f"_{ticket.code}.pdf"
            )
            zf.writestr(filename, pdf_bytes)
            badge_count += 1

    if badge_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No confirmed tickets found — cannot generate badges",
        )

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=badges_{event_id}.zip",
            "X-Badge-Count": str(badge_count),
        },
    )


# ── GET /api/v1/badges/{visitor_id}.pdf ──────────────────────────────────────

@router.get(
    "/{visitor_id}.pdf",
    summary="Download badge PDF for one visitor",
    responses={200: {"content": {"application/pdf": {}}}},
)
async def get_badge_pdf(
    visitor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Generates and returns an A6 badge PDF for the specified visitor.
    Uses their first confirmed ticket for the QR code.
    Falls back to a pending ticket if no confirmed ticket is found.
    """
    # Load visitor
    v_result = await db.execute(select(Visitor).where(Visitor.id == visitor_id))
    visitor  = v_result.scalar_one_or_none()
    if visitor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visitor {visitor_id} not found",
        )

    # Load event
    ev_result = await db.execute(select(Event).where(Event.id == visitor.event_id))
    event = ev_result.scalar_one_or_none()

    # Load best available ticket
    t_result = await db.execute(
        select(Ticket)
        .where(Ticket.visitor_id == visitor.id)
        .order_by(
            # confirmed first, then pending
            Ticket.status.asc()
        )
        .limit(1)
    )
    ticket = t_result.scalar_one_or_none()

    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visitor {visitor_id} has no tickets — cannot generate badge",
        )

    qr_bytes = (
        base64.b64decode(ticket.qr_data)
        if ticket.qr_data
        else generate_qr_code(ticket.code, str(ticket.event_id), str(visitor.id))
    )

    pdf_bytes = generate_badge_pdf(visitor, ticket, event, qr_bytes)

    filename = (
        f"badge_{visitor.last_name.upper()}_{visitor.first_name.upper()}.pdf"
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
