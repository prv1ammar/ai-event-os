"""
app/routers/leads.py — CRUD for leads via TybotFlow SmartDB
Table: contacts | Base: CRM (pmr53jrrzjqwe) | ID: m78f17b1f5fcb640d

A "lead" is a CRM contact: identity + source + lead_status,
optionally linked to a company (companies_id) and an event (events_id).
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "m78f17b1f5fcb640d"

router = APIRouter(prefix="/api/v1/leads", tags=["Leads"])


@router.get("", summary="List leads")
async def list_leads(
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
    record = await tybot.get_by_table(TABLE_ID, str(lead_id))
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
