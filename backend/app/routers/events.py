"""
app/routers/events.py — CRUD for events via TybotFlow SmartDB
Table: events | Base: Evenements (pmr53j9yjvo1c) | ID: m3ae0796104dae2e3
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "m3ae0796104dae2e3"
KEEP_KEYS = {"languages"}  # genuine MultiSelect array column, not a relation

router = APIRouter(prefix="/api/v1/events", tags=["Events"])


@router.get("", summary="List events")
async def list_events(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    status: Optional[str] = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    if status:
        params["where"] = f"(status,eq,{status})"
    return await tybot.list_by_table(TABLE_ID, params)


@router.post("", status_code=201, summary="Create event")
async def create_event(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data, keep_keys=KEEP_KEYS)


@router.get("/{event_id}", summary="Get event by ID")
async def get_event(
    event_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(event_id))
    if not record:
        raise HTTPException(status_code=404, detail="Event not found")
    return record


@router.patch("/{event_id}", summary="Update event")
async def update_event(
    event_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = event_id
    return await tybot.update(TABLE_ID, data, keep_keys=KEEP_KEYS)


@router.delete("/{event_id}", summary="Delete event")
async def delete_event(
    event_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(event_id))
    return {"message": "Deleted"}
