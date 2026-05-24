"""
app/routers/scans.py
──────────────────────
FastAPI router — QR scan validation, history, and live analytics.

Endpoints:
  POST /api/v1/scans/validate               main check-in endpoint
  GET  /api/v1/scans                        scan history (filters: event_id, zone, date)
  GET  /api/v1/scans/stats/{event_id}       aggregate stats per event
  GET  /api/v1/scans/live-count/{event_id}  current venue occupancy
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.scan import (
    LiveCountResponse,
    ScanResponse,
    ScanStatsResponse,
    ScanValidateRequest,
    ScanValidateResponse,
    ScanVisitorInfo,
)
from app.services import scan_service

router = APIRouter(prefix="/api/v1/scans", tags=["Scans"])


# ── POST /api/v1/scans/validate ───────────────────────────────────────────────

@router.post(
    "/validate",
    response_model=ScanValidateResponse,
    summary="Validate a QR scan and record access",
)
async def validate_scan(
    data: ScanValidateRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Main check-in endpoint used by scan devices.

    - Parses the QR data (`AIEVENT-{e_hex}-{v_hex}-{code}` format)
    - Validates ticket status, event dates, and zone access rules
    - On success: records the scan and broadcasts via Redis pub/sub
    - Returns `valid: true/false` with a human-readable message

    **Zone values:**
    `entry_general` · `lounge_vip` · `lounge_press` · `restaurant`
    · `session_general` · `session_reserved` · `backstage`
    """
    result = await scan_service.validate_scan(
        db=db,
        qr_data=data.qr_data,
        zone=data.zone,
        device_id=data.device_id,
    )

    visitor_info = None
    if result.get("visitor"):
        v = result["visitor"]
        visitor_info = ScanVisitorInfo(
            id=v["id"],
            name=v["name"],
            type=v["type"],
            company=v.get("company"),
        )

    return ScanValidateResponse(
        valid=result["valid"],
        message=result["message"],
        visitor=visitor_info,
        ticket_code=result.get("ticket_code"),
        zone=result.get("zone"),
        scanned_at=result.get("scanned_at"),
    )


# ── GET /api/v1/scans ─────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=List[ScanResponse],
    summary="Scan history with optional filters",
)
async def list_scans(
    event_id:  Optional[UUID] = Query(None, description="Filter by event"),
    zone:      Optional[str]  = Query(None, description="Filter by zone (e.g. entry_general)"),
    scan_date: Optional[date] = Query(None, description="Filter by date YYYY-MM-DD"),
    page:  int = Query(1,  ge=1,         description="Page number"),
    limit: int = Query(20, ge=1, le=200, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return paginated QR scan history."""
    return await scan_service.get_history(db, event_id, zone, scan_date, page, limit)


# ── GET /api/v1/scans/stats/{event_id} ────────────────────────────────────────

@router.get(
    "/stats/{event_id}",
    response_model=ScanStatsResponse,
    summary="Aggregate scan statistics for an event",
)
async def get_scan_stats(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Returns:
    - total_scans, unique_visitors
    - entries_by_hour ({"09:00": 45, ...})
    - entries_by_zone ({"entry_general": 300, ...})
    - entries_by_type ({"vip": 50, "standard": 250, ...})
    """
    stats = await scan_service.get_stats(db, event_id)
    return ScanStatsResponse(**stats)


# ── GET /api/v1/scans/live-count/{event_id} ───────────────────────────────────

@router.get(
    "/live-count/{event_id}",
    response_model=LiveCountResponse,
    summary="Real-time venue occupancy estimate",
)
async def get_live_count(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Returns today's unique entry count and a visitors_online estimate.
    Refreshes on every call — pair with the `/ws/scans/live/{event_id}`
    WebSocket for push updates.
    """
    data = await scan_service.get_live_count(db, event_id)
    return LiveCountResponse(**data)
