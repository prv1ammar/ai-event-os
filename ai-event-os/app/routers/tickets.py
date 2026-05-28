"""
app/routers/tickets.py — CRUD for tickets via TybotFlow SmartDB
Table: tickets | ID: mvh8nlnhuqcaaik
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "tickets"
TABLE_ID = "mvh8nlnhuqcaaik"

router = APIRouter(prefix="/api/v1/tickets", tags=["Tickets"])


@router.get("", summary="List tickets")
async def list_tickets(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    if event_id:
        params["where"] = f"(event_id,eq,{event_id})"
    return await tybot.list(TABLE, params)


@router.post("", status_code=201, summary="Create ticket")
async def create_ticket(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{ticket_id}", summary="Get ticket by ID")
async def get_ticket(
    ticket_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get(TABLE, str(ticket_id))
    if not record:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return record


@router.patch("/{ticket_id}", summary="Update ticket")
async def update_ticket(
    ticket_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = ticket_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{ticket_id}", summary="Delete ticket")
async def delete_ticket(
    ticket_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(ticket_id))
    return {"message": "Deleted"}
