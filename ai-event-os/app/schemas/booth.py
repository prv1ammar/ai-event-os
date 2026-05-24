"""
app/schemas/booth.py
────────────────────
Pydantic v2 request/response schemas for Booth and BoothReservation.

Booth status:       available | reserved | occupied
Reservation status: pending | confirmed | cancelled
Payment status:     pending | paid | partial | refunded
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


# ── Booth Base ─────────────────────────────────────────────────────────────────

class BoothBase(BaseModel):
    number: str                         # e.g. A45, B12
    zone: Optional[str] = None          # Hall A, Outdoor, etc.
    size_m2: Optional[float] = None
    price_mad: int = 0                  # price in MAD (no VAT)


# ── Booth Create / Update ──────────────────────────────────────────────────────

class BoothCreate(BoothBase):
    event_id: UUID


class BoothUpdate(BaseModel):
    number: Optional[str] = None
    zone: Optional[str] = None
    size_m2: Optional[float] = None
    price_mad: Optional[int] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: Optional[str]) -> Optional[str]:
        allowed = {"available", "reserved", "occupied", None}
        if v not in allowed:
            raise ValueError(f"status must be one of {allowed - {None}}")
        return v


# ── Booth Response ─────────────────────────────────────────────────────────────

class BoothResponse(BoothBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    event_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime


# ── Reservation ────────────────────────────────────────────────────────────────

class ReserveBoothRequest(BaseModel):
    """Body for POST /booths/{id}/reserve"""
    exhibitor_id: UUID
    price_mad: Optional[int] = None     # negotiated price; defaults to booth.price_mad
    package: Optional[str] = None       # extra package label
    services: Optional[dict[str, Any]] = None  # extra services JSON


class BoothReservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    booth_id: UUID
    exhibitor_id: UUID
    price_mad: int
    package: Optional[str] = None
    status: str
    payment_status: str
    services: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


# ── Floor Plan ─────────────────────────────────────────────────────────────────

# Zone colour palette (deterministic — same zone always gets same colour)
ZONE_COLOURS: dict[str, str] = {
    "default": "#94a3b8",
    "Hall A":   "#3b82f6",
    "Hall B":   "#10b981",
    "Hall C":   "#f59e0b",
    "Outdoor":  "#84cc16",
    "VIP":      "#a855f7",
}


class FloorPlanBooth(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    number: str
    zone: Optional[str] = None
    size_m2: Optional[float] = None
    price_mad: int
    status: str                         # available | reserved | occupied
    colour: str = "#94a3b8"             # zone colour for UI rendering
    exhibitor_id: Optional[UUID] = None # set if reserved/occupied
    exhibitor_name: Optional[str] = None


class FloorPlanZone(BaseModel):
    zone_name: str
    colour: str
    total_booths: int
    available: int
    reserved: int
    occupied: int
    occupancy_pct: float                # 0.0 – 100.0
    booths: list[FloorPlanBooth]


class FloorPlanResponse(BaseModel):
    event_id: UUID
    total_booths: int
    overall_occupancy_pct: float
    zones: list[FloorPlanZone]
