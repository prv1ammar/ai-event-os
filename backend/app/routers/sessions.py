"""
app/routers/sessions.py — CRUD for sessions via TybotFlow SmartDB
Table: sessions | Base: Evenements (pmr53j9yjvo1c) | ID: mabd59f3b36f4df83
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "mabd59f3b36f4df83"

router = APIRouter(prefix="/api/v1/sessions", tags=["Sessions"])


@router.get("", summary="List sessions")
async def list_sessions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    if event_id:
        params["where"] = f"(events_id,eq,{event_id})"
    return await tybot.list_by_table(TABLE_ID, params)


@router.post("", status_code=201, summary="Create session")
async def create_session(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{session_id}", summary="Get session by ID")
async def get_session(
    session_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(session_id))
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    return record


@router.patch("/{session_id}", summary="Update session")
async def update_session(
    session_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = session_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{session_id}", summary="Delete session")
async def delete_session(
    session_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(session_id))
    return {"message": "Deleted"}
