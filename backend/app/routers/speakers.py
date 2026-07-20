"""
app/routers/speakers.py — CRUD for speakers via TybotFlow SmartDB
Table: speakers | Base: Evenements (pmr53j9yjvo1c) | ID: m3b3ee6b189d42a05
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "m3b3ee6b189d42a05"

router = APIRouter(prefix="/api/v1/speakers", tags=["Speakers"])


@router.get("", summary="List speakers")
async def list_speakers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    return await tybot.list_by_table(TABLE_ID, params)


@router.post("", status_code=201, summary="Create speaker")
async def create_speaker(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{speaker_id}", summary="Get speaker by ID")
async def get_speaker(
    speaker_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(speaker_id))
    if not record:
        raise HTTPException(status_code=404, detail="Speaker not found")
    return record


@router.patch("/{speaker_id}", summary="Update speaker")
async def update_speaker(
    speaker_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = speaker_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{speaker_id}", summary="Delete speaker")
async def delete_speaker(
    speaker_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(speaker_id))
    return {"message": "Deleted"}
