"""
app/routers/badges.py — CRUD for badges via TybotFlow SmartDB
Table: badges | ID: mf0ehalcglml4tx
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "badges"
TABLE_ID = "mf0ehalcglml4tx"

router = APIRouter(prefix="/api/v1/badges", tags=["Badges"])


@router.get("", summary="List badges")
async def list_badges(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    return await tybot.list(TABLE, params)


@router.post("", status_code=201, summary="Create badge")
async def create_badge(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{badge_id}", summary="Get badge by ID")
async def get_badge(
    badge_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get(TABLE, str(badge_id))
    if not record:
        raise HTTPException(status_code=404, detail="Badge not found")
    return record


@router.patch("/{badge_id}", summary="Update badge")
async def update_badge(
    badge_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = badge_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{badge_id}", summary="Delete badge")
async def delete_badge(
    badge_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(badge_id))
    return {"message": "Deleted"}
