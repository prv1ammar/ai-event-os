"""
app/routers/leads.py
─────────────────────
Lead pipeline management + Excel export + B2B meeting scheduling.

Route order matters — literal paths before parametric ones:
  GET  /export.xlsx          ← must come before GET /{id}
  GET  /stats/{event_id}     ← must come before GET /{id}
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.common import MessageResponse
from app.schemas.lead import (
    LeadCreate,
    LeadExportRow,
    LeadFunnelStats,
    LeadResponse,
    LeadStatusUpdate,
    LeadUpdate,
    ScheduleMeetingFromLead,
)
from app.schemas.meeting import MeetingResponse
from app.services import lead_service
from app.services.export_service import export_leads_excel

router = APIRouter(prefix="/api/v1/leads", tags=["Leads"])


# ── GET /api/v1/leads/export.xlsx ─────────────────────────────────────────────
# IMPORTANT: defined FIRST to avoid being swallowed by /{id}

@router.get(
    "/export.xlsx",
    summary="Export filtered leads to Excel (3 sheets)",
    responses={200: {"content": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}}}},
    response_class=Response,
)
async def export_leads_excel_endpoint(
    event_id: Optional[UUID] = Query(None),
    exhibitor_id: Optional[UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Download an Excel workbook with:
    - **Sheet 1**: All leads (colour-coded by status)
    - **Sheet 2**: Summary by status (count / % / avg score)
    - **Sheet 3**: Top leads only (score ≥ 70)
    """
    leads = await lead_service.get_leads_for_export(db, event_id, exhibitor_id, status_filter)

    rows: list[dict] = []
    for lead in leads:
        v = lead.visitor
        ex = lead.exhibitor
        rows.append({
            "id":               str(lead.id),
            "visitor_name":     f"{v.first_name} {v.last_name}" if v else "",
            "visitor_email":    v.email if v else "",
            "visitor_phone":    v.phone if v else None,
            "visitor_company":  v.company if v else None,
            "exhibitor_name":   ex.company_name if ex else "",
            "status":           lead.status,
            "score":            lead.score,
            "budget_range":     lead.budget_range,
            "notes":            lead.notes,
            "created_at":       lead.created_at.strftime("%Y-%m-%d %H:%M") if lead.created_at else "",
        })

    xlsx_bytes = export_leads_excel(rows)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="leads-export.xlsx"',
            "Content-Length": str(len(xlsx_bytes)),
        },
    )


# ── GET /api/v1/leads/stats/{event_id} ────────────────────────────────────────

@router.get(
    "/stats/{event_id}",
    response_model=LeadFunnelStats,
    summary="Lead funnel stats for an event (count by status, avg score)",
)
async def lead_funnel_stats(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await lead_service.get_funnel_stats(db, event_id)


# ── GET /api/v1/leads ─────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[LeadResponse],
    summary="List leads (filter by event / exhibitor / status / min score)",
)
async def list_leads(
    event_id: Optional[UUID] = Query(None),
    exhibitor_id: Optional[UUID] = Query(None),
    status: Optional[str] = Query(None, description="new|contacted|qualified|opportunity|closed_won|closed_lost"),
    min_score: Optional[int] = Query(None, ge=0, le=100),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await lead_service.get_all(db, event_id, exhibitor_id, status, min_score, page, limit)


# ── POST /api/v1/leads ────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=LeadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a lead manually",
)
async def create_lead(
    data: LeadCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Initial score is computed automatically from visitor interactions.
    Status is derived from the score unless explicitly provided.
    """
    return await lead_service.create(db, data)


# ── GET /api/v1/leads/{id} ────────────────────────────────────────────────────

@router.get(
    "/{lead_id}",
    response_model=LeadResponse,
    summary="Get lead detail with visitor and exhibitor info",
)
async def get_lead(
    lead_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await lead_service.get_by_id(db, lead_id)


# ── PUT /api/v1/leads/{id} ────────────────────────────────────────────────────

@router.put(
    "/{lead_id}",
    response_model=LeadResponse,
    summary="Update lead notes / score / budget",
)
async def update_lead(
    lead_id: UUID,
    data: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await lead_service.update(db, lead_id, data)


# ── DELETE /api/v1/leads/{id} ─────────────────────────────────────────────────

@router.delete(
    "/{lead_id}",
    response_model=MessageResponse,
    summary="Delete a lead",
)
async def delete_lead(
    lead_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await lead_service.delete(db, lead_id)


# ── PUT /api/v1/leads/{id}/status ─────────────────────────────────────────────

@router.put(
    "/{lead_id}/status",
    response_model=LeadResponse,
    summary="Update pipeline status: new → contacted → qualified → opportunity → won/lost",
)
async def update_lead_status(
    lead_id: UUID,
    data: LeadStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await lead_service.update_status(db, lead_id, data)


# ── POST /api/v1/leads/{id}/schedule-meeting ──────────────────────────────────

@router.post(
    "/{lead_id}/schedule-meeting",
    response_model=MeetingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule a B2B meeting directly from a lead",
)
async def schedule_meeting_from_lead(
    lead_id: UUID,
    data: ScheduleMeetingFromLead,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Creates a Meeting record and transitions the lead from 'new' → 'contacted'.
    """
    return await lead_service.schedule_meeting_from_lead(db, lead_id, data)
