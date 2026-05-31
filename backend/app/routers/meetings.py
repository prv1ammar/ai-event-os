"""
app/routers/meetings.py — CRUD for B2B meetings via TybotFlow SmartDB
Table: meetings | ID: mjpes0pvg5s69oq
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "meetings"
TABLE_ID = "mjpes0pvg5s69oq"

router = APIRouter(prefix="/api/v1/meetings", tags=["Meetings"])


@router.get("", summary="List meetings")
async def list_meetings(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    if event_id:
        params["where"] = f"(event_id,eq,{event_id})"
    return await tybot.list(TABLE, params)


@router.post("", status_code=201, summary="Schedule a meeting")
async def create_meeting(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{meeting_id}", summary="Get meeting by ID")
async def get_meeting(
    meeting_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get(TABLE, str(meeting_id))
    if not record:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return record


@router.patch("/{meeting_id}", summary="Update meeting")
async def update_meeting(
    meeting_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = meeting_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{meeting_id}", summary="Delete meeting")
async def delete_meeting(
    meeting_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(meeting_id))
    return {"message": "Deleted"}
