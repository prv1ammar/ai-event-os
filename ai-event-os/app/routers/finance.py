"""
app/routers/finance.py
──────────────────────
Financial dashboard and export endpoints.

GET  /api/v1/finance/dashboard/{event_id}          full financial dashboard
GET  /api/v1/finance/kpis/{event_id}               KPI cards only
GET  /api/v1/finance/revenue-by-source/{event_id}  revenue breakdown by source
GET  /api/v1/finance/export.xlsx                   Excel workbook (4 sheets)
GET  /api/v1/finance/export.pdf                    PDF summary report
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.services import finance_service

router = APIRouter(prefix="/api/v1/finance", tags=["Finance"])


# ── GET /api/v1/finance/dashboard/{event_id} ──────────────────────────────────

@router.get(
    "/dashboard/{event_id}",
    summary="Full financial dashboard",
)
async def get_financial_dashboard(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Returns the complete financial snapshot:
    budget totals, expense commitments, revenue confirmed, ROI,
    occupancy rate, revenue by source, and budget-vs-actual per category.
    All monetary values in MAD.
    """
    return await finance_service.get_financial_dashboard(db, event_id)


# ── GET /api/v1/finance/kpis/{event_id} ───────────────────────────────────────

@router.get(
    "/kpis/{event_id}",
    summary="KPI card data for an event",
)
async def get_kpis(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Lightweight subset of the dashboard — suitable for KPI card widgets:
    revenue_confirmed_mad, budget_total_mad, roi_percent, occupancy_rate,
    result_forecast_mad, expenses_committed_mad.
    """
    return await finance_service.get_kpis(db, event_id)


# ── GET /api/v1/finance/revenue-by-source/{event_id} ─────────────────────────

@router.get(
    "/revenue-by-source/{event_id}",
    summary="Revenue breakdown by source (stands / sponsoring / partenaires / inscriptions)",
)
async def get_revenue_by_source(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await finance_service.get_revenue_by_source(db, event_id)


# ── GET /api/v1/finance/export.xlsx ───────────────────────────────────────────

@router.get(
    "/export.xlsx",
    summary="Download full financial Excel report (4 sheets)",
    response_class=Response,
)
async def export_excel(
    event_id: UUID = Query(..., description="Event UUID to export"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    4-sheet Excel workbook:
    1. Résumé — KPI cards
    2. Budget — budget vs. actual with variance colouring
    3. Paiements — payment register header
    4. Revenus par source — revenue breakdown

    Returns: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    """
    financial_data = await finance_service.get_financial_dashboard(db, event_id)
    event_name: str = financial_data.get("event_name", str(event_id))
    xlsx_bytes = finance_service.export_financial_excel(event_name, financial_data)

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="finance-{event_id}.xlsx"'
        },
    )


# ── GET /api/v1/finance/export.pdf ────────────────────────────────────────────

@router.get(
    "/export.pdf",
    summary="Download financial summary PDF report",
    response_class=Response,
)
async def export_pdf(
    event_id: UUID = Query(..., description="Event UUID to export"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    A4 PDF summary with KPI table, budget-vs-actual, and revenue-by-source.
    Returns: application/pdf
    """
    financial_data = await finance_service.get_financial_dashboard(db, event_id)
    event_name: str = financial_data.get("event_name", str(event_id))
    pdf_bytes = finance_service.export_financial_pdf(event_name, financial_data)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="finance-{event_id}.pdf"'
        },
    )
