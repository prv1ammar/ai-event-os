"""
app/routers/event_exhibitors.py
Many-to-many link between events and exhibitors.
Table: event_exhibitors | ID: m3t0vz4j08ypmjt
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "event_exhibitors"
TABLE_ID = "m3t0vz4j08ypmjt"

router = APIRouter(prefix="/api/v1/event-exhibitors", tags=["Event Exhibitors"])


@router.get("", summary="List event-exhibitor links")
async def list_links(
    event_id: int = Query(None),
    exhibitor_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    rows = await tybot.list(TABLE, {"limit": 500})
    if event_id is not None:
        rows = [r for r in rows if r.get("event_id") == event_id]
    if exhibitor_id is not None:
        rows = [r for r in rows if r.get("exhibitor_id") == exhibitor_id]
    return rows


@router.post("", status_code=201, summary="Assign exhibitor to event")
async def assign(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    # Prevent duplicate links
    existing = await tybot.list(TABLE, {"limit": 500})
    for row in existing:
        if row.get("event_id") == data.get("event_id") and row.get("exhibitor_id") == data.get("exhibitor_id"):
            raise HTTPException(status_code=409, detail="This exhibitor is already assigned to this event")
    return await tybot.create(TABLE_ID, data)


@router.delete("/{link_id}", summary="Remove exhibitor from event")
async def unassign(
    link_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(link_id))
    return {"message": "Removed"}
