"""
app/routers/visitors.py — CRUD for visitors via TybotFlow SmartDB
Table: visitors | ID: mczsulpngbjjif5
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "visitors"
TABLE_ID = "mczsulpngbjjif5"

router = APIRouter(prefix="/api/v1/visitors", tags=["Visitors"])


@router.get("", summary="List visitors")
async def list_visitors(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    rows = await tybot.list(TABLE, {"limit": 500})
    if event_id is not None:
        rows = [r for r in rows if r.get("event_id") == event_id]
    start = (page - 1) * limit
    return rows[start : start + limit]


@router.post("", status_code=201, summary="Create visitor")
async def create_visitor(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{visitor_id}", summary="Get visitor by ID")
async def get_visitor(
    visitor_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get(TABLE, str(visitor_id))
    if not record:
        raise HTTPException(status_code=404, detail="Visitor not found")
    return record


@router.patch("/{visitor_id}", summary="Update visitor")
async def update_visitor(
    visitor_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = visitor_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{visitor_id}", summary="Delete visitor")
async def delete_visitor(
    visitor_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(visitor_id))
    return {"message": "Deleted"}
