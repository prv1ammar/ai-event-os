"""
app/routers/exhibitors.py — CRUD for exhibitors via TybotFlow SmartDB
Table: exhibitors | ID: mrdg571gqvhuiz0
"""

import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "exhibitors"
TABLE_ID = "mrdg571gqvhuiz0"
JUNCTION_TABLE = "event_exhibitors"

router = APIRouter(prefix="/api/v1/exhibitors", tags=["Exhibitors"])


@router.get("", summary="List exhibitors")
async def list_exhibitors(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    if event_id is not None:
        # Use junction table: get exhibitor_ids for this event, then filter
        links, all_exhibitors = await asyncio.gather(
            tybot.list(JUNCTION_TABLE, {"limit": 500}),
            tybot.list(TABLE, {"limit": 500}),
        )
        assigned_ids = {lnk.get("exhibitor_id") for lnk in links if lnk.get("event_id") == event_id}
        rows = [e for e in all_exhibitors if e.get("id") in assigned_ids]
    else:
        rows = await tybot.list(TABLE, {"limit": 500})
    start = (page - 1) * limit
    return rows[start : start + limit]


@router.post("", status_code=201, summary="Create exhibitor")
async def create_exhibitor(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{exhibitor_id}", summary="Get exhibitor by ID")
async def get_exhibitor(
    exhibitor_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get(TABLE, str(exhibitor_id))
    if not record:
        raise HTTPException(status_code=404, detail="Exhibitor not found")
    return record


@router.patch("/{exhibitor_id}", summary="Update exhibitor")
async def update_exhibitor(
    exhibitor_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = exhibitor_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{exhibitor_id}", summary="Delete exhibitor")
async def delete_exhibitor(
    exhibitor_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(exhibitor_id))
    return {"message": "Deleted"}
