"""
app/routers/booths.py — CRUD for stands/booths via TybotFlow SmartDB
Table: stands | ID: mkj64l8r6nvaoak
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "stands"
TABLE_ID = "mkj64l8r6nvaoak"

router = APIRouter(prefix="/api/v1/booths", tags=["Booths"])


@router.get("", summary="List booths/stands")
async def list_booths(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    return await tybot.list(TABLE, params)


@router.post("", status_code=201, summary="Create booth/stand")
async def create_booth(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{booth_id}", summary="Get booth by ID")
async def get_booth(
    booth_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get(TABLE, str(booth_id))
    if not record:
        raise HTTPException(status_code=404, detail="Booth not found")
    return record


@router.patch("/{booth_id}", summary="Update booth")
async def update_booth(
    booth_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = booth_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{booth_id}", summary="Delete booth")
async def delete_booth(
    booth_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(booth_id))
    return {"message": "Deleted"}
