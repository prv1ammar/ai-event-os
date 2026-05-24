"""
app/routers/reports.py
───────────────────────
Post-event report downloads.

All endpoints stream binary files (PDF / XLSX / PPTX).
Organizer or admin role required — these reports contain confidential KPIs.

Routes
──────
GET /api/v1/reports/post-event/{event_id}.pdf    — 8-page post-event PDF
GET /api/v1/reports/post-event/{event_id}.xlsx   — multi-sheet Excel export
GET /api/v1/reports/post-event/{event_id}.pptx   — 7-slide executive PPTX
GET /api/v1/reports/organizer/{event_id}.pdf     — alias for organizer summary
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin
from app.services.report_service import (
    build_event_report_data,
    generate_event_excel,
    generate_executive_pptx,
    generate_post_event_pdf,
)

router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])

# ── MIME type shortcuts ────────────────────────────────────────────────────────
PDF_MIME  = "application/pdf"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


# ── GET /api/v1/reports/post-event/{event_id}.pdf ─────────────────────────────

@router.get(
    "/post-event/{event_id}.pdf",
    summary="Download full 8-page post-event PDF report",
    response_class=Response,
    responses={200: {"content": {PDF_MIME: {}}}},
)
async def download_post_event_pdf(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Generates and streams a complete post-event PDF report (8 pages):

    1. Cover page
    2. Executive summary (KPI cards + performance vs objectives)
    3. Visitor analytics
    4. Exhibitor performance
    5. Leads & ROI
    6. Marketing performance
    7. AI-generated recommendations
    8. Appendix (raw data tables)
    """
    event, stats = await build_event_report_data(db, event_id)
    pdf_bytes = generate_post_event_pdf(event, stats)

    safe_name = (stats.get("event_name") or str(event_id)).replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type=PDF_MIME,
        headers={
            "Content-Disposition": f'attachment; filename="post-event-{safe_name}.pdf"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


# ── GET /api/v1/reports/post-event/{event_id}.xlsx ────────────────────────────

@router.get(
    "/post-event/{event_id}.xlsx",
    summary="Download multi-sheet Excel data export",
    response_class=Response,
    responses={200: {"content": {XLSX_MIME: {}}}},
)
async def download_post_event_xlsx(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Generates and streams an Excel workbook with 4 sheets:

    1. **KPI Summary** — headline metrics
    2. **Visitor Breakdown** — count by visitor type
    3. **Financial Summary** — revenue / expenses / ROI
    4. **Lead Funnel** — conversion by pipeline stage
    """
    event, stats = await build_event_report_data(db, event_id)
    xlsx_bytes = generate_event_excel(event, stats)

    safe_name = (stats.get("event_name") or str(event_id)).replace(" ", "_")
    return Response(
        content=xlsx_bytes,
        media_type=XLSX_MIME,
        headers={
            "Content-Disposition": f'attachment; filename="report-{safe_name}.xlsx"',
            "Content-Length": str(len(xlsx_bytes)),
        },
    )


# ── GET /api/v1/reports/post-event/{event_id}.pptx ───────────────────────────

@router.get(
    "/post-event/{event_id}.pptx",
    summary="Download 7-slide executive PowerPoint presentation",
    response_class=Response,
    responses={200: {"content": {PPTX_MIME: {}}}},
)
async def download_post_event_pptx(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Generates and streams a 7-slide executive PPTX presentation:

    1. Title — event name + headline KPIs
    2. Attendance Overview
    3. Exhibitor Performance
    4. Leads & Business Development
    5. Marketing Performance
    6. Financial Results & ROI
    7. Recommendations & Next Edition

    Theme: dark navy (#1a1a2e) background + purple (#7c3aed) accent.
    """
    event, stats = await build_event_report_data(db, event_id)
    pptx_bytes = generate_executive_pptx(event, stats)

    safe_name = (stats.get("event_name") or str(event_id)).replace(" ", "_")
    return Response(
        content=pptx_bytes,
        media_type=PPTX_MIME,
        headers={
            "Content-Disposition": f'attachment; filename="executive-report-{safe_name}.pptx"',
            "Content-Length": str(len(pptx_bytes)),
        },
    )


# ── GET /api/v1/reports/organizer/{event_id}.pdf ──────────────────────────────

@router.get(
    "/organizer/{event_id}.pdf",
    summary="Download organizer summary PDF (alias for post-event PDF)",
    response_class=Response,
    responses={200: {"content": {PDF_MIME: {}}}},
)
async def download_organizer_pdf(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """Convenience alias for the full post-event PDF report."""
    event, stats = await build_event_report_data(db, event_id)
    pdf_bytes = generate_post_event_pdf(event, stats)

    safe_name = (stats.get("event_name") or str(event_id)).replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type=PDF_MIME,
        headers={
            "Content-Disposition": f'attachment; filename="organizer-report-{safe_name}.pdf"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )
