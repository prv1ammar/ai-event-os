"""
app/routers/campaigns.py — CRUD for C via TybotFlow SmartDB
Table: campaigns | Base: Croissance (pmr53m4tfsaf6) | ID: m71641a984d0f9564
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "m71641a984d0f9564"

router = APIRouter(prefix="/api/v1/campaigns", tags=["Campaigns"])


@router.get("", summary="List campaigns")
async def list_campaigns(
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


@router.post("", status_code=201, summary="Create campaign")
async def create_campaign(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{campaign_id}", summary="Get campaign by ID")
async def get_campaign(
    campaign_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(campaign_id))
    if not record:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return record


@router.patch("/{campaign_id}", summary="Update campaign")
async def update_campaign(
    campaign_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = campaign_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{campaign_id}", summary="Delete campaign")
async def delete_campaign(
    campaign_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(campaign_id))
    return {"message": "Deleted"}
