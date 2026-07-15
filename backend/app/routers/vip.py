"""
app/routers/vip.py — CRUD for VIP guests via TybotFlow SmartDB
Table: vip | Base: Participants (pmr53k2m2uh2j) | ID: m216af58aa010ca2f

A VIP record represents a visitor or exhibitor promoted to VIP status
(vip_level: standard | premium | diamant), linked back via visiteurs_id
or exposants_id.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "m216af58aa010ca2f"

router = APIRouter(prefix="/api/v1/vip", tags=["VIP"])


@router.get("", summary="List VIP guests")
async def list_vip(
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


@router.post("", status_code=201, summary="Create VIP record")
async def create_vip(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{vip_id}", summary="Get VIP record by ID")
async def get_vip(
    vip_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(vip_id))
    if not record:
        raise HTTPException(status_code=404, detail="VIP record not found")
    return record


@router.patch("/{vip_id}", summary="Update VIP record")
async def update_vip(
    vip_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = vip_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{vip_id}", summary="Delete VIP record")
async def delete_vip(
    vip_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(vip_id))
    return {"message": "Deleted"}
