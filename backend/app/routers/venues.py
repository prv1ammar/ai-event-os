"""
app/routers/venues.py — CRUD for venues via TybotFlow SmartDB
Table: venues | Base: Evenements (pmr53j9yjvo1c) | ID: maeaf41fb5ddb9049

Each venue links to at most one event via events_id.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "maeaf41fb5ddb9049"

router = APIRouter(prefix="/api/v1/venues", tags=["Venues"])


@router.get("", summary="List venues")
async def list_venues(
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    if event_id:
        params["where"] = f"(events_id,eq,{event_id})"
    return await tybot.list_by_table(TABLE_ID, params)


@router.post("", status_code=201, summary="Create venue")
async def create_venue(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{venue_id}", summary="Get venue by ID")
async def get_venue(
    venue_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(venue_id))
    if not record:
        raise HTTPException(status_code=404, detail="Venue not found")
    return record


@router.patch("/{venue_id}", summary="Update venue")
async def update_venue(
    venue_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = venue_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{venue_id}", summary="Delete venue")
async def delete_venue(
    venue_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(venue_id))
    return {"message": "Deleted"}
