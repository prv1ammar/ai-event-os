"""
app/services/exhibitor_service.py
──────────────────────────────────
Business logic for Exhibitor CRUD and PDF offer generation.

PDF format (ReportLab):
  - Header: AI EVENT OS branding + event title
  - Exhibitor block: company, contact, sector, package
  - Booth block: number, zone, size, price HT + VAT 20% + price TTC
  - Package services list
  - Payment terms & bank details
  - Signature block
"""

from __future__ import annotations

import io
import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.booth import Booth, BoothReservation
from app.models.event import Event
from app.models.exhibitor import Exhibitor
from app.models.lead import Lead
from app.schemas.exhibitor import ExhibitorCreate, ExhibitorStatusUpdate, ExhibitorUpdate

# ── ReportLab imports ──────────────────────────────────────────────────────────
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── Package → included services mapping ───────────────────────────────────────
PACKAGE_SERVICES: dict[str, list[str]] = {
    "standard": [
        "9 m² booth space",
        "2 exhibitor badges",
        "Basic fascia board with company name",
        "1 power socket (220V)",
        "Listing in event catalogue",
    ],
    "premium": [
        "18 m² booth space",
        "4 exhibitor badges",
        "Custom fascia board",
        "2 power sockets (220V)",
        "Full-page listing in event catalogue",
        "1 logo on event website",
    ],
    "gold": [
        "30 m² booth space",
        "6 exhibitor badges",
        "Custom shell-scheme stand",
        "4 power sockets (220V)",
        "Double-page listing in event catalogue",
        "Logo on event website + printed banner",
        "Speaking slot (15 min)",
        "Pre-event email mention",
    ],
    "platinum": [
        "54 m² booth space (corner)",
        "10 exhibitor badges",
        "Custom-built stand (incl. carpet & lighting)",
        "6 power sockets (220V)",
        "Back-cover advertisement in catalogue",
        "Exclusive logo placement — main stage",
        "Keynote speaking slot (30 min)",
        "Dedicated pre & post-event campaign",
        "VIP lounge access",
        "Priority lead-capture integration",
    ],
}

VAT_RATE = 0.20  # 20 % Moroccan VAT


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, exhibitor_id: uuid.UUID) -> Exhibitor:
    result = await db.execute(
        select(Exhibitor)
        .options(selectinload(Exhibitor.booth_reservations))
        .where(Exhibitor.id == exhibitor_id)
    )
    exhibitor = result.scalar_one_or_none()
    if exhibitor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exhibitor {exhibitor_id} not found",
        )
    return exhibitor


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def get_all(
    db: AsyncSession,
    status_filter: Optional[str],
    sector: Optional[str],
    event_id: Optional[uuid.UUID],
    page: int,
    limit: int,
) -> list[Exhibitor]:
    query = select(Exhibitor).options(selectinload(Exhibitor.booth_reservations))

    if status_filter:
        query = query.where(Exhibitor.status == status_filter)
    if sector:
        query = query.where(Exhibitor.sector == sector)
    if event_id:
        query = query.where(Exhibitor.event_id == event_id)

    query = (
        query
        .order_by(Exhibitor.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, exhibitor_id: uuid.UUID) -> Exhibitor:
    return await _get_or_404(db, exhibitor_id)


async def create(db: AsyncSession, data: ExhibitorCreate, current_user) -> Exhibitor:
    # Verify event exists
    event_result = await db.execute(select(Event).where(Event.id == data.event_id))
    if event_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {data.event_id} not found",
        )

    exhibitor = Exhibitor(
        company_name=data.company_name,
        sector=data.sector,
        size=data.size,
        contact_name=data.contact_name,
        contact_email=data.contact_email,
        contact_phone=data.contact_phone,
        country=data.country,
        website=data.website,
        logo_url=data.logo_url,
        package=data.package or "standard",
        status="pending",
        event_id=data.event_id,
    )
    db.add(exhibitor)
    await db.flush()
    await db.refresh(exhibitor, ["booth_reservations"])
    return exhibitor


async def update(
    db: AsyncSession,
    exhibitor_id: uuid.UUID,
    data: ExhibitorUpdate,
) -> Exhibitor:
    exhibitor = await _get_or_404(db, exhibitor_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(exhibitor, field, value)
    await db.flush()
    await db.refresh(exhibitor, ["booth_reservations"])
    return exhibitor


async def update_status(
    db: AsyncSession,
    exhibitor_id: uuid.UUID,
    data: ExhibitorStatusUpdate,
) -> Exhibitor:
    exhibitor = await _get_or_404(db, exhibitor_id)

    # Enforce business rule: can only reserve a booth once validated
    exhibitor.status = data.status
    await db.flush()
    await db.refresh(exhibitor, ["booth_reservations"])
    return exhibitor


async def get_leads(
    db: AsyncSession,
    exhibitor_id: uuid.UUID,
    page: int,
    limit: int,
) -> list[Lead]:
    await _get_or_404(db, exhibitor_id)
    query = (
        select(Lead)
        .where(Lead.exhibitor_id == exhibitor_id)
        .order_by(Lead.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


# ── PDF Offer Generation ───────────────────────────────────────────────────────

async def generate_offer_pdf(
    db: AsyncSession,
    exhibitor_id: uuid.UUID,
) -> bytes:
    """Generate a ReportLab PDF commercial offer for the exhibitor."""
    exhibitor = await _get_or_404(db, exhibitor_id)

    # Resolve event
    event_result = await db.execute(select(Event).where(Event.id == exhibitor.event_id))
    event: Event = event_result.scalar_one_or_none()

    # Resolve active booth reservation (if any)
    br_result = await db.execute(
        select(BoothReservation)
        .join(Booth, BoothReservation.booth_id == Booth.id)
        .where(
            BoothReservation.exhibitor_id == exhibitor_id,
            BoothReservation.status != "cancelled",
        )
        .limit(1)
    )
    reservation: Optional[BoothReservation] = br_result.scalar_one_or_none()

    booth: Optional[Booth] = None
    if reservation:
        b_result = await db.execute(select(Booth).where(Booth.id == reservation.booth_id))
        booth = b_result.scalar_one_or_none()

    return _build_pdf(exhibitor, event, reservation, booth)


def _build_pdf(
    exhibitor: Exhibitor,
    event: Optional[Event],
    reservation: Optional[BoothReservation],
    booth: Optional[Booth],
) -> bytes:
    """Pure PDF generation — no DB calls. Returns raw bytes."""
    buffer = io.BytesIO()

    # ── Document template ─────────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=f"Commercial Offer — {exhibitor.company_name}",
        author="AI EVENT OS",
    )

    styles = getSampleStyleSheet()
    W = A4[0] - 4 * cm  # usable width

    # Custom styles
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=20, textColor=colors.HexColor("#1e40af"), spaceAfter=6)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, textColor=colors.HexColor("#1e40af"), spaceBefore=10, spaceAfter=4)
    normal = styles["Normal"]
    small = ParagraphStyle("Small", parent=normal, fontSize=9, textColor=colors.grey)
    bold_p = ParagraphStyle("Bold", parent=normal, fontName="Helvetica-Bold")

    story = []

    # ── Header ────────────────────────────────────────────────────────────────
    header_data = [
        [
            Paragraph("<b>AI EVENT OS</b>", ParagraphStyle("brand", fontSize=22, textColor=colors.HexColor("#1e40af"), fontName="Helvetica-Bold")),
            Paragraph(
                f"<b>COMMERCIAL OFFER</b><br/>"
                f"<font size=9 color='grey'>Ref: OFFER-{str(exhibitor.id)[:8].upper()}<br/>"
                f"Date: {_today()}</font>",
                ParagraphStyle("ref", fontSize=11, alignment=2),
            ),
        ]
    ]
    header_table = Table(header_data, colWidths=[W * 0.55, W * 0.45])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width=W, thickness=2, color=colors.HexColor("#1e40af")))
    story.append(Spacer(1, 0.4 * cm))

    # ── Event block ───────────────────────────────────────────────────────────
    event_name = event.name if event else "N/A"
    event_dates = (
        f"{event.start_date} → {event.end_date}" if event else "N/A"
    )
    event_venue = f"{event.venue or ''}, {event.city or ''}" if event else "N/A"

    story.append(Paragraph("Event Information", h2))
    _append_kv_table(story, W, [
        ("Event", event_name),
        ("Dates", event_dates),
        ("Venue", event_venue),
    ])
    story.append(Spacer(1, 0.3 * cm))

    # ── Exhibitor block ───────────────────────────────────────────────────────
    story.append(Paragraph("Exhibitor Details", h2))
    _append_kv_table(story, W, [
        ("Company", exhibitor.company_name),
        ("Sector", exhibitor.sector or "—"),
        ("Company Size", exhibitor.size or "—"),
        ("Contact", exhibitor.contact_name),
        ("Email", exhibitor.contact_email),
        ("Phone", exhibitor.contact_phone or "—"),
        ("Country", exhibitor.country or "Morocco"),
        ("Package", (exhibitor.package or "standard").upper()),
    ])
    story.append(Spacer(1, 0.3 * cm))

    # ── Booth block ───────────────────────────────────────────────────────────
    story.append(Paragraph("Booth Assignment", h2))
    if booth and reservation:
        price_ht = reservation.price_mad or booth.price_mad
        vat_amount = round(price_ht * VAT_RATE)
        price_ttc = price_ht + vat_amount
        _append_kv_table(story, W, [
            ("Booth Number", booth.number),
            ("Zone", booth.zone or "—"),
            ("Size", f"{booth.size_m2 or '—'} m²"),
            ("Price HT", f"{price_ht:,} MAD"),
            (f"VAT ({int(VAT_RATE * 100)}%)", f"{vat_amount:,} MAD"),
            ("Price TTC", f"{price_ttc:,} MAD"),
            ("Reservation Status", (reservation.status or "pending").capitalize()),
            ("Payment Status", (reservation.payment_status or "pending").capitalize()),
        ])
    else:
        story.append(Paragraph("No booth assigned yet. Contact us to reserve your space.", normal))
    story.append(Spacer(1, 0.3 * cm))

    # ── Package services ──────────────────────────────────────────────────────
    pkg = (exhibitor.package or "standard").lower()
    services = PACKAGE_SERVICES.get(pkg, PACKAGE_SERVICES["standard"])
    story.append(Paragraph("Included Services", h2))
    for svc in services:
        story.append(Paragraph(f"✓  {svc}", ParagraphStyle("svc", parent=normal, leftIndent=10, spaceAfter=2)))
    story.append(Spacer(1, 0.3 * cm))

    # ── Payment terms ─────────────────────────────────────────────────────────
    story.append(Paragraph("Payment Terms", h2))
    story.append(Paragraph(
        "50% deposit required upon signature of this offer. "
        "Balance due 30 days before event start date. "
        "All amounts in Moroccan Dirham (MAD) inclusive of 20% TVA.",
        normal,
    ))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("Bank Details", h2))
    _append_kv_table(story, W, [
        ("Bank", "Attijariwafa Bank"),
        ("Account Name", "AI EVENT OS SARL"),
        ("IBAN", "MA64 0110 0000 0000 0000 1234 567"),
        ("SWIFT/BIC", "BCMAMAMC"),
        ("Reference", f"OFFER-{str(exhibitor.id)[:8].upper()}"),
    ])
    story.append(Spacer(1, 0.5 * cm))

    # ── Signature block ───────────────────────────────────────────────────────
    story.append(HRFlowable(width=W, thickness=1, color=colors.lightgrey))
    story.append(Spacer(1, 0.3 * cm))
    sig_data = [
        [
            Paragraph("<b>For AI EVENT OS</b><br/><br/><br/>Signature: ________________", normal),
            Paragraph(f"<b>For {exhibitor.company_name}</b><br/><br/><br/>Signature: ________________", normal),
        ]
    ]
    sig_table = Table(sig_data, colWidths=[W / 2, W / 2])
    sig_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(sig_table)
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph(
        "AI EVENT OS — Platform de gestion d'événements professionnels | contact@aievents.ma",
        small,
    ))

    doc.build(story)
    return buffer.getvalue()


# ── PDF helpers ────────────────────────────────────────────────────────────────

def _today() -> str:
    from datetime import date
    return date.today().strftime("%d %B %Y")


def _append_kv_table(story, width, rows: list[tuple[str, str]]) -> None:
    """Add a two-column key-value table to the story."""
    data = [[Paragraph(f"<b>{k}</b>", getSampleStyleSheet()["Normal"]), v] for k, v in rows]
    t = Table(data, colWidths=[width * 0.35, width * 0.65])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eff6ff")),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#1e40af")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
