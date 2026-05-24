"""
app/services/booth_service.py
──────────────────────────────
Business logic for Booth CRUD, reservation flow, and floor-plan aggregation.

Business rules enforced here:
  • A booth can only be reserved if the exhibitor status is 'validated'.
  • A booth must be 'available' before it can be reserved.
  • Reserving a booth changes its status to 'reserved'.
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.booth import Booth, BoothReservation
from app.models.event import Event
from app.models.exhibitor import Exhibitor
from app.schemas.booth import (
    BoothCreate,
    BoothUpdate,
    FloorPlanBooth,
    FloorPlanResponse,
    FloorPlanZone,
    ReserveBoothRequest,
    ZONE_COLOURS,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_booth_or_404(db: AsyncSession, booth_id: uuid.UUID) -> Booth:
    result = await db.execute(
        select(Booth)
        .options(selectinload(Booth.reservations))
        .where(Booth.id == booth_id)
    )
    booth = result.scalar_one_or_none()
    if booth is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Booth {booth_id} not found",
        )
    return booth


def _zone_colour(zone: Optional[str]) -> str:
    if zone and zone in ZONE_COLOURS:
        return ZONE_COLOURS[zone]
    return ZONE_COLOURS["default"]


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def get_all(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    zone: Optional[str],
    status_filter: Optional[str],
    page: int,
    limit: int,
) -> list[Booth]:
    query = select(Booth).options(selectinload(Booth.reservations))

    if event_id:
        query = query.where(Booth.event_id == event_id)
    if zone:
        query = query.where(Booth.zone == zone)
    if status_filter:
        query = query.where(Booth.status == status_filter)

    query = (
        query
        .order_by(Booth.zone.asc(), Booth.number.asc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, booth_id: uuid.UUID) -> Booth:
    return await _get_booth_or_404(db, booth_id)


async def create(db: AsyncSession, data: BoothCreate, current_user) -> Booth:
    # Verify event exists
    ev_result = await db.execute(select(Event).where(Event.id == data.event_id))
    if ev_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {data.event_id} not found",
        )

    booth = Booth(
        number=data.number,
        zone=data.zone,
        size_m2=data.size_m2,
        price_mad=data.price_mad,
        status="available",
        event_id=data.event_id,
    )
    db.add(booth)
    await db.flush()
    await db.refresh(booth, ["reservations"])
    return booth


async def update(
    db: AsyncSession,
    booth_id: uuid.UUID,
    data: BoothUpdate,
) -> Booth:
    booth = await _get_booth_or_404(db, booth_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(booth, field, value)
    await db.flush()
    await db.refresh(booth, ["reservations"])
    return booth


# ── Reservation flow ───────────────────────────────────────────────────────────

async def reserve(
    db: AsyncSession,
    booth_id: uuid.UUID,
    data: ReserveBoothRequest,
) -> BoothReservation:
    booth = await _get_booth_or_404(db, booth_id)

    # Guard 1: booth must be available
    if booth.status != "available":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Booth {booth.number} is not available (current status: {booth.status})",
        )

    # Guard 2: exhibitor must exist and be validated
    ex_result = await db.execute(select(Exhibitor).where(Exhibitor.id == data.exhibitor_id))
    exhibitor: Optional[Exhibitor] = ex_result.scalar_one_or_none()
    if exhibitor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exhibitor {data.exhibitor_id} not found",
        )
    if exhibitor.status != "validated":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Exhibitor must be validated before reserving a booth",
        )

    # Agreed price defaults to booth's listed price
    negotiated_price = data.price_mad if data.price_mad is not None else booth.price_mad

    reservation = BoothReservation(
        booth_id=booth_id,
        exhibitor_id=data.exhibitor_id,
        price_mad=negotiated_price,
        package=data.package,
        status="pending",
        payment_status="pending",
        services=data.services or {},
    )
    db.add(reservation)

    # Update booth status
    booth.status = "reserved"
    await db.flush()
    await db.refresh(reservation)
    return reservation


# ── Floor plan ─────────────────────────────────────────────────────────────────

async def get_floor_plan(db: AsyncSession, event_id: uuid.UUID) -> FloorPlanResponse:
    # Ensure event exists
    ev_result = await db.execute(select(Event).where(Event.id == event_id))
    if ev_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found",
        )

    # Load all booths with their active reservations
    booths_result = await db.execute(
        select(Booth)
        .options(selectinload(Booth.reservations).selectinload(BoothReservation.exhibitor))
        .where(Booth.event_id == event_id)
        .order_by(Booth.zone.asc(), Booth.number.asc())
    )
    booths: list[Booth] = list(booths_result.scalars().all())

    if not booths:
        return FloorPlanResponse(
            event_id=event_id,
            total_booths=0,
            overall_occupancy_pct=0.0,
            zones=[],
        )

    # Group booths by zone
    zones_map: dict[str, list[Booth]] = {}
    for b in booths:
        zone_key = b.zone or "General"
        zones_map.setdefault(zone_key, []).append(b)

    zone_responses: list[FloorPlanZone] = []
    total_non_available = 0

    for zone_name, zone_booths in zones_map.items():
        colour = _zone_colour(zone_name)
        available = sum(1 for b in zone_booths if b.status == "available")
        reserved = sum(1 for b in zone_booths if b.status == "reserved")
        occupied = sum(1 for b in zone_booths if b.status == "occupied")
        total_non_available += reserved + occupied

        fp_booths: list[FloorPlanBooth] = []
        for b in zone_booths:
            # Find most recent non-cancelled reservation
            active_res = next(
                (r for r in sorted(b.reservations, key=lambda r: r.created_at, reverse=True)
                 if r.status != "cancelled"),
                None,
            )
            fp_booths.append(
                FloorPlanBooth(
                    id=b.id,
                    number=b.number,
                    zone=b.zone,
                    size_m2=b.size_m2,
                    price_mad=b.price_mad,
                    status=b.status,
                    colour=colour,
                    exhibitor_id=active_res.exhibitor_id if active_res else None,
                    exhibitor_name=(
                        active_res.exhibitor.company_name
                        if active_res and active_res.exhibitor
                        else None
                    ),
                )
            )

        total = len(zone_booths)
        occupancy_pct = round(((reserved + occupied) / total) * 100, 1) if total else 0.0

        zone_responses.append(
            FloorPlanZone(
                zone_name=zone_name,
                colour=colour,
                total_booths=total,
                available=available,
                reserved=reserved,
                occupied=occupied,
                occupancy_pct=occupancy_pct,
                booths=fp_booths,
            )
        )

    total_booths = len(booths)
    overall_pct = round((total_non_available / total_booths) * 100, 1) if total_booths else 0.0

    return FloorPlanResponse(
        event_id=event_id,
        total_booths=total_booths,
        overall_occupancy_pct=overall_pct,
        zones=zone_responses,
    )
