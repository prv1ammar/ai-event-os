"""
app/routers/leads.py — CRUD for leads via TybotFlow SmartDB
Table: leads | ID: mi2q9y1gl4fiq52
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "leads"
TABLE_ID = "mi2q9y1gl4fiq52"

router = APIRouter(prefix="/api/v1/leads", tags=["Leads"])


@router.get("", summary="List leads")
async def list_leads(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    rows = await tybot.list(TABLE, {"limit": 500})
    if event_id is not None:
        rows = [r for r in rows if r.get("event_id") == event_id]
    start = (page - 1) * limit
    return rows[start : start + limit]


@router.post("", status_code=201, summary="Create lead")
async def create_lead(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{lead_id}", summary="Get lead by ID")
async def get_lead(
    lead_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get(TABLE, str(lead_id))
    if not record:
        raise HTTPException(status_code=404, detail="Lead not found")
    return record


@router.patch("/{lead_id}", summary="Update lead")
async def update_lead(
    lead_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = lead_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{lead_id}", summary="Delete lead")
async def delete_lead(
    lead_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(lead_id))
    return {"message": "Deleted"}
