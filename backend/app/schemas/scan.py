"""
app/schemas/scan.py
───────────────────
Pydantic v2 schemas for QR scan validation, history, and live stats.

Zone vocabulary (matches access matrix in scan_service):
  entry_general | lounge_vip | lounge_press | restaurant
  session_general | session_reserved | backstage
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

# ── Validate request/response ─────────────────────────────────────────────────

class ScanValidateRequest(BaseModel):
    """Body for POST /api/v1/scans/validate."""

    qr_data: str
    zone: str = "entry_general"
    device_id: Optional[str] = None

    @field_validator("qr_data")
    @classmethod
    def strip_qr(cls, v: str) -> str:
        return v.strip()


class ScanVisitorInfo(BaseModel):
    """Visitor summary embedded in a successful scan response."""

    id: UUID
    name: str
    type: str
    company: Optional[str] = None


class ScanValidateResponse(BaseModel):
    """Result of a QR scan validation attempt."""

    valid: bool
    message: str
    visitor: Optional[ScanVisitorInfo] = None
    ticket_code: Optional[str] = None
    zone: Optional[str] = None
    scanned_at: Optional[datetime] = None


# ── Scan history ──────────────────────────────────────────────────────────────

class ScanResponse(BaseModel):
    """Single QR scan log entry."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    ticket_id: UUID
    visitor_id: UUID
    event_id: UUID
    scan_type: str
    zone: Optional[str] = None
    device_id: Optional[str] = None
    scanned_at: datetime


# ── Statistics ────────────────────────────────────────────────────────────────

class ScanStatsResponse(BaseModel):
    """Aggregate scan analytics for one event."""

    event_id: UUID
    total_scans: int
    unique_visitors: int
    entries_by_hour: Dict[str, int]    # "HH:00" → count
    entries_by_zone: Dict[str, int]    # zone  → count
    entries_by_type: Dict[str, int]    # visitor type → count


class LiveCountResponse(BaseModel):
    """Real-time entry count for a live event dashboard."""

    event_id: UUID
    entries_today: int
    visitors_online: int               # estimated: entries − exits
    last_updated: datetime
