"""
app/services/invoice_service.py
────────────────────────────────
Invoice lifecycle management and PDF generation via ReportLab.

Number format : INV-{YYYY}-{MM}-{seq:04d}   e.g. INV-2026-05-0001
TVA rate      : 20 %  (amounts_ttc = amounts_ht × 1.20)
Currency      : MAD (Moroccan Dirham) — no EUR / USD.

PDF layout (A4)
───────────────
  HEADER  : AI EVENT OS branding | Invoice # + dates
  PAYER   : company name, address, ICE
  TABLE   : Description | Qty | Unit HT | TVA 20 % | Total TTC
  TOTALS  : sous-total HT → TVA → TOTAL TTC (bold/accent)
  PAYMENT : virement / RIB / référence
  FOOTER  : legal mentions
"""

from __future__ import annotations

import io
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.payment import Payment
from app.schemas.invoice import InvoiceGenerateRequest


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, invoice_id: uuid.UUID) -> Invoice:
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    inv = result.scalar_one_or_none()
    if inv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice {invoice_id} not found",
        )
    return inv


async def _next_invoice_number(db: AsyncSession, now: datetime) -> str:
    """
    Generate the next sequential invoice number for the current month.
    Format: INV-{YYYY}-{MM}-{seq:04d}
    """
    prefix = f"INV-{now.year}-{now.month:02d}-"
    count_q = await db.execute(
        select(func.count(Invoice.id)).where(
            Invoice.invoice_number.like(f"{prefix}%")
        )
    )
    seq = int(count_q.scalar() or 0) + 1
    return f"{prefix}{seq:04d}"


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def list_invoices(
    db: AsyncSession,
    event_id: Optional[uuid.UUID] = None,
    inv_status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> list[Invoice]:
    query = select(Invoice)
    if event_id:
        query = query.where(Invoice.event_id == event_id)
    if inv_status:
        query = query.where(Invoice.status == inv_status)
    query = (
        query
        .order_by(Invoice.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def generate_invoice(
    db: AsyncSession,
    payment_id: uuid.UUID,
    data: InvoiceGenerateRequest,
) -> Invoice:
    """
    Generate an invoice for a given payment.
    - Raises 404 if payment not found.
    - Raises 409 if an invoice already exists for this payment.
    - Back-calculates HT from TTC: HT = TTC / 1.20
    """
    pay_q = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = pay_q.scalar_one_or_none()
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment {payment_id} not found",
        )

    # Idempotency guard
    dup_q = await db.execute(
        select(Invoice).where(Invoice.payment_id == payment_id)
    )
    if dup_q.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An invoice already exists for this payment",
        )

    now = datetime.now(timezone.utc)
    invoice_number = await _next_invoice_number(db, now)

    # TTC → HT back-calculation (TVA 20 %)
    amount_ttc = payment.amount_mad
    amount_ht = int(round(amount_ttc / 1.20))
    tva_amount = amount_ttc - amount_ht

    due_date = now + timedelta(days=data.due_days)
    description = (
        data.description
        or f"Prestation événement — réf. {payment.reference or str(payment_id)[:8].upper()}"
    )

    invoice = Invoice(
        invoice_number=invoice_number,
        payment_id=payment_id,
        event_id=payment.event_id,
        payer_name=data.payer_name or "Client",
        payer_email=data.payer_email or "",
        payer_company=data.payer_company,
        payer_ice=data.payer_ice,
        payer_address=data.payer_address,
        description=description,
        amount_ht_mad=amount_ht,
        tva_rate=20,
        tva_mad=tva_amount,
        amount_ttc_mad=amount_ttc,
        status="draft",
        due_date=due_date,
    )
    db.add(invoice)
    await db.flush()
    await db.refresh(invoice)
    return invoice


async def get_invoice(db: AsyncSession, invoice_id: uuid.UUID) -> Invoice:
    return await _get_or_404(db, invoice_id)


async def send_invoice_email(
    db: AsyncSession,
    invoice_id: uuid.UUID,
    override_email: Optional[str] = None,
    message: Optional[str] = None,
) -> dict:
    """
    Mark invoice as 'sent', stamp sent_at, and (in production) dispatch via SendGrid.
    """
    invoice = await _get_or_404(db, invoice_id)
    recipient = override_email or invoice.payer_email

    invoice.status = "sent"
    invoice.sent_at = datetime.now(timezone.utc)
    await db.flush()

    # Production: integrate SendGrid / SMTP here
    return {
        "message": f"Invoice {invoice.invoice_number} sent to {recipient}",
        "invoice_number": invoice.invoice_number,
        "recipient": recipient,
    }


# ── PDF generation ─────────────────────────────────────────────────────────────

def generate_invoice_pdf(invoice: Invoice) -> bytes:
    """
    Produce a professional A4 PDF invoice using ReportLab Platypus.

    Layout
    ──────
    1. Header  : AI EVENT OS logo block  |  FACTURE + number + dates
    2. Payer   : company block with ICE
    3. Table   : Description | Qté | HT | TVA 20% | TTC
    4. Totals  : sous-total HT / TVA / TOTAL TTC (bold accent)
    5. Payment : virement bancaire / RIB / référence
    6. Footer  : legal mentions
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        HRFlowable,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
    )

    PRIMARY = colors.HexColor("#1A1A2E")
    ACCENT = colors.HexColor("#7C3AED")
    LIGHT = colors.HexColor("#F3F4F6")
    WHITE = colors.white

    styles = getSampleStyleSheet()

    def ps(name: str, **kw) -> ParagraphStyle:
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    def mad(val: int) -> str:
        return f"{val:,} MAD".replace(",", " ")

    def fmt_date(dt: Optional[datetime]) -> str:
        return dt.strftime("%d/%m/%Y") if dt else "N/A"

    elems = []

    # ── 1. Header ─────────────────────────────────────────────────────────────
    left_block = [
        [Paragraph("AI EVENT OS",
                   ps("BrandTitle", fontSize=20, textColor=PRIMARY, fontName="Helvetica-Bold"))],
        [Paragraph("Plateforme de gestion d'événements<br/>Casablanca, Maroc",
                   ps("BrandSub", fontSize=9, textColor=ACCENT))],
    ]
    right_block = [
        [Paragraph(f"<b>FACTURE</b>",
                   ps("InvLabel", fontSize=14, textColor=PRIMARY, alignment=2))],
        [Paragraph(f"<font color='#7C3AED'><b>{invoice.invoice_number}</b></font>",
                   ps("InvNum", fontSize=13, alignment=2))],
        [Paragraph(
            f"Date : {fmt_date(invoice.created_at)}<br/>"
            f"Échéance : {fmt_date(invoice.due_date)}",
            ps("InvDates", fontSize=9, textColor=PRIMARY, alignment=2),
        )],
    ]

    header_tbl = Table(
        [[Table(left_block, colWidths=[90 * mm]),
          Table(right_block, colWidths=[85 * mm])]],
        colWidths=[95 * mm, 85 * mm],
    )
    header_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                     ("PADDING", (0, 0), (-1, -1), 0)]))
    elems.append(header_tbl)
    elems.append(Spacer(1, 4 * mm))
    elems.append(HRFlowable(width="100%", thickness=2, color=ACCENT))
    elems.append(Spacer(1, 6 * mm))

    # ── 2. Payer block ────────────────────────────────────────────────────────
    elems.append(Paragraph(
        "FACTURER À",
        ps("SectionLabel", fontSize=8, textColor=colors.HexColor("#6B7280"),
           fontName="Helvetica-Bold"),
    ))
    elems.append(Spacer(1, 2 * mm))

    lines = [f"<b>{invoice.payer_name}</b>"]
    if invoice.payer_company:
        lines.append(invoice.payer_company)
    if invoice.payer_address:
        lines.append(invoice.payer_address)
    if invoice.payer_ice:
        lines.append(f"ICE : {invoice.payer_ice}")
    lines.append(invoice.payer_email)

    payer_tbl = Table(
        [[Paragraph("<br/>".join(lines), ps("PayerText", fontSize=9, textColor=PRIMARY))]],
        colWidths=[180 * mm],
    )
    payer_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))
    elems.append(payer_tbl)
    elems.append(Spacer(1, 7 * mm))

    # ── 3. Line items table ───────────────────────────────────────────────────
    elems.append(Paragraph(
        "DÉTAIL DE LA PRESTATION",
        ps("SectionLabel2", fontSize=8, textColor=colors.HexColor("#6B7280"),
           fontName="Helvetica-Bold"),
    ))
    elems.append(Spacer(1, 2 * mm))

    items_data = [
        ["Description", "Qté", "Prix HT (MAD)", "TVA 20 %", "Total TTC (MAD)"],
        [
            invoice.description,
            "1",
            mad(invoice.amount_ht_mad),
            mad(invoice.tva_mad),
            mad(invoice.amount_ttc_mad),
        ],
    ]
    items_tbl = Table(
        items_data,
        colWidths=[72 * mm, 14 * mm, 34 * mm, 30 * mm, 36 * mm],
    )
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    elems.append(items_tbl)
    elems.append(Spacer(1, 4 * mm))

    # ── 4. Totals ─────────────────────────────────────────────────────────────
    totals_data = [
        ["Sous-total HT :", mad(invoice.amount_ht_mad)],
        [f"TVA ({invoice.tva_rate} %) :", mad(invoice.tva_mad)],
        ["TOTAL TTC :", mad(invoice.amount_ttc_mad)],
    ]
    totals_tbl = Table(totals_data, colWidths=[140 * mm, 46 * mm])
    totals_tbl.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTSIZE", (0, 2), (-1, 2), 13),
        ("TEXTCOLOR", (0, 2), (-1, 2), ACCENT),
        ("LINEABOVE", (0, 2), (-1, 2), 1.5, ACCENT),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elems.append(totals_tbl)
    elems.append(Spacer(1, 6 * mm))

    # ── 5. Payment details ────────────────────────────────────────────────────
    elems.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#E5E7EB")))
    elems.append(Spacer(1, 3 * mm))
    elems.append(Paragraph(
        "INFORMATIONS DE PAIEMENT",
        ps("PayLabel", fontSize=8, textColor=colors.HexColor("#6B7280"),
           fontName="Helvetica-Bold"),
    ))
    elems.append(Spacer(1, 2 * mm))
    elems.append(Paragraph(
        "Méthode de paiement : Virement bancaire / CMI<br/>"
        "RIB : 000 000 000 000 000 000 00<br/>"
        f"Référence : {invoice.invoice_number}",
        ps("PayText", fontSize=9, textColor=PRIMARY),
    ))
    elems.append(Spacer(1, 10 * mm))

    # ── 6. Footer ─────────────────────────────────────────────────────────────
    elems.append(HRFlowable(width="100%", thickness=1, color=ACCENT))
    elems.append(Spacer(1, 2 * mm))
    elems.append(Paragraph(
        "AI EVENT OS — ICE : 000000000000000 — RC : 123456 — Casablanca, Maroc<br/>"
        "Tout montant non réglé à l'échéance sera majoré de pénalités de retard "
        "au taux légal en vigueur au Maroc.",
        ps("Footer", fontSize=7, textColor=colors.HexColor("#9CA3AF")),
    ))

    doc.build(elems)
    return buf.getvalue()
