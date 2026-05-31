"""
app/routers/exhibitors.py — CRUD for exhibitors via TybotFlow SmartDB
Table: exhibitors | ID: mrdg571gqvhuiz0
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "exhibitors"
TABLE_ID = "mrdg571gqvhuiz0"

router = APIRouter(prefix="/api/v1/exhibitors", tags=["Exhibitors"])


@router.get("", summary="List exhibitors")
async def list_exhibitors(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    if event_id:
        params["where"] = f"(event_id,eq,{event_id})"
    try:
        return await tybot.list(TABLE, params)
    except Exception:
        # TybotFlow may not support where filter on this table — fall back to all
        rows = await tybot.list(TABLE, {"limit": limit, "offset": (page - 1) * limit})
        if event_id:
            rows = [r for r in rows if str(r.get("event_id", "")) == str(event_id)]
        return rows


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
