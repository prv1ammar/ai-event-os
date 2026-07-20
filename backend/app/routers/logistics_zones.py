"""
app/routers/logistics_zones.py — CRUD for logistics zones via TybotFlow SmartDB
Table: logistics_zones | Base: Evenements (pmr53j9yjvo1c) | ID: mfaa02fb229fd3806

A zone belongs to a venue (venues_id), can optionally belong to a parent zone
(logistics_zones_id, for hall > sous-zone nesting), and can optionally be
scoped to one event (events_id) so the same venue can carry different zone
layouts per event — a zone with no events_id is treated as shared across all
events at that venue. Stands/commercial spaces belong to a zone via
commercial_spaces.logistics_zones_id.

venue_id/parent_id/event_id are filtered in Python below rather than via
TybotFlow's `where` query param: this table has a self-referential
logistics_zones_id relation (parent/child zones) and `where` resolves it
ambiguously, silently returning every row unfiltered instead of erroring —
confirmed directly against the TybotFlow API, not just through this backend.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "mfaa02fb229fd3806"

router = APIRouter(prefix="/api/v1/logistics-zones", tags=["Logistics Zones"])


@router.get("", summary="List logistics zones")
async def list_zones(
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    venue_id: int = Query(None),
    parent_id: int = Query(None),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    raw = await tybot.list_by_table(TABLE_ID, {"limit": 500, "offset": 0})
    rows = raw.get("list", raw) if isinstance(raw, dict) else raw

    if parent_id is not None:
        rows = [r for r in rows if r.get("logistics_zones_id") == parent_id]
    elif venue_id is not None:
        rows = [r for r in rows if r.get("venues_id") == venue_id]
        if event_id is not None:
            rows = [r for r in rows if r.get("events_id") in (None, event_id)]

    start = (page - 1) * limit
    page_rows = rows[start:start + limit]
    if isinstance(raw, dict) and "list" in raw:
        return {**raw, "list": page_rows}
    return page_rows


@router.post("", status_code=201, summary="Create logistics zone")
async def create_zone(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{zone_id}", summary="Get logistics zone by ID")
async def get_zone(
    zone_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(zone_id))
    if not record:
        raise HTTPException(status_code=404, detail="Logistics zone not found")
    return record


@router.patch("/{zone_id}", summary="Update logistics zone")
async def update_zone(
    zone_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = zone_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{zone_id}", summary="Delete logistics zone")
async def delete_zone(
    zone_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(zone_id))
    return {"message": "Deleted"}
