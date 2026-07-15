"""
app/routers/logistics_zones.py — CRUD for logistics zones via TybotFlow SmartDB
Table: logistics_zones | Base: Evenements (pmr53j9yjvo1c) | ID: mfaa02fb229fd3806

A zone belongs to a venue (venues_id) and can optionally belong to a parent
zone (logistics_zones_id, for hall > sous-zone nesting). Stands/commercial
spaces belong to a zone via commercial_spaces.logistics_zones_id.
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
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    if parent_id:
        params["where"] = f"(logistics_zones_id,eq,{parent_id})"
    elif venue_id:
        params["where"] = f"(venues_id,eq,{venue_id})"
    return await tybot.list_by_table(TABLE_ID, params)


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
