"""
app/routers/visitors.py
────────────────────────
FastAPI router — full visitor management.

Endpoints:
  GET    /api/v1/visitors                    paginated list (filters: type, event_id, country)
  POST   /api/v1/visitors                    register single visitor
  POST   /api/v1/visitors/import-csv         bulk CSV import (multipart)
  GET    /api/v1/visitors/export.xlsx        export filtered visitors to Excel
  GET    /api/v1/visitors/{id}               visitor detail + tickets + scans
  GET    /api/v1/visitors/{id}/journey       full scan journey
  PUT    /api/v1/visitors/{id}               update visitor info
  DELETE /api/v1/visitors/{id}               remove visitor

NOTE: static paths (/import-csv, /export.xlsx) are declared BEFORE the
      parameterised /{id} route so FastAPI resolves them correctly.
"""

from __future__ import annotations

import math
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.visitor import (
    VisitorCreate,
    VisitorDetailResponse,
    VisitorImportResult,
    VisitorJourneyResponse,
    VisitorResponse,
    VisitorUpdate,
)
from app.services import visitor_service

router = APIRouter(prefix="/api/v1/visitors", tags=["Visitors"])


# ── GET /api/v1/visitors ──────────────────────────────────────────────────────

@router.get(
    "",
    response_model=PaginatedResponse[VisitorResponse],
    summary="List visitors with optional filters",
)
async def list_visitors(
    event_id: Optional[UUID] = Query(None, description="Filter by event UUID"),
    type:     Optional[str]  = Query(None, description="Filter by visitor type"),
    country:  Optional[str]  = Query(None, description="Filter by country"),
    page:  int = Query(1,  ge=1,         description="Page number (1-based)"),
    limit: int = Query(20, ge=1, le=200, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    items, total = await visitor_service.get_all(db, event_id, type, country, page, limit)
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit) if total else 0,
    )


# ── POST /api/v1/visitors ─────────────────────────────────────────────────────

@router.post(
    "",
    response_model=VisitorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a single visitor",
)
async def create_visitor(
    data: VisitorCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """Register one visitor and attach them to the given event."""
    return await visitor_service.create(db, data)


# ── POST /api/v1/visitors/import-csv  (BEFORE /{id}) ─────────────────────────

@router.post(
    "/import-csv",
    response_model=VisitorImportResult,
    status_code=status.HTTP_200_OK,
    summary="Bulk-import visitors from a CSV file",
)
async def import_csv(
    event_id: UUID = Query(..., description="Event to attach imported visitors to"),
    file: UploadFile = File(..., description="CSV file — must include: first_name, last_name, email, company, type"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Upload a CSV with visitor rows.  The CSV **must** include at minimum:

    | first_name | last_name | email | company | type |
    |---|---|---|---|---|

    Optional columns: `phone`, `role`, `country`.

    Duplicate emails (already registered for this event) are skipped.
    Returns a summary with counts and per-row error messages.
    """
    result = await visitor_service.import_from_csv(db, file, event_id)
    return VisitorImportResult(**result)


# ── GET /api/v1/visitors/export.xlsx  (BEFORE /{id}) ─────────────────────────

@router.get(
    "/export.xlsx",
    summary="Export visitors to Excel",
    response_class=StreamingResponse,
)
async def export_xlsx(
    event_id: Optional[UUID] = Query(None),
    type:     Optional[str]  = Query(None),
    country:  Optional[str]  = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """Download a filtered visitor list as an `.xlsx` workbook."""
    xlsx_bytes = await visitor_service.export_to_xlsx(db, event_id, type, country)
    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=visitors.xlsx"},
    )


# ── GET /api/v1/visitors/{id} ─────────────────────────────────────────────────

@router.get(
    "/{visitor_id}",
    response_model=VisitorDetailResponse,
    summary="Visitor detail — includes tickets and scan history",
)
async def get_visitor(
    visitor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await visitor_service.get_by_id(db, visitor_id)


# ── GET /api/v1/visitors/{id}/journey ────────────────────────────────────────

@router.get(
    "/{visitor_id}/journey",
    response_model=VisitorJourneyResponse,
    summary="Full scan journey (parcours) for a visitor",
)
async def get_visitor_journey(
    visitor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns all QR scans in chronological order — the visitor's on-site journey."""
    data = await visitor_service.get_journey(db, visitor_id)
    return VisitorJourneyResponse(**data)


# ── PUT /api/v1/visitors/{id} ─────────────────────────────────────────────────

@router.put(
    "/{visitor_id}",
    response_model=VisitorResponse,
    summary="Update visitor info",
)
async def update_visitor(
    visitor_id: UUID,
    data: VisitorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await visitor_service.update(db, visitor_id, data)


# ── DELETE /api/v1/visitors/{id} ─────────────────────────────────────────────

@router.delete(
    "/{visitor_id}",
    response_model=MessageResponse,
    summary="Remove a visitor (cascades to tickets and scans)",
)
async def delete_visitor(
    visitor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await visitor_service.delete(db, visitor_id)
