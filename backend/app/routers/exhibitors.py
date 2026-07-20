"""
app/routers/exhibitors.py — CRUD for exhibitors via TybotFlow SmartDB
Table: exposants | Base: Participants (pmr53k2m2uh2j) | ID: m0b2dd0eb02083bf3

Exhibitors have no events_id column of their own — an exhibitor links to an
event only indirectly via contacts_id -> contacts.events_id (contacts is the
"leads" table, Base: CRM, ID m78f17b1f5fcb640d). Filtering by event_id below
does that join in Python since TybotFlow's `where` errors ("column events_id
does not exist") if you try to filter this table by it directly.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "m0b2dd0eb02083bf3"
CONTACTS_TABLE_ID = "m78f17b1f5fcb640d"

router = APIRouter(prefix="/api/v1/exhibitors", tags=["Exhibitors"])


@router.get("", summary="List exhibitors")
async def list_exhibitors(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    if event_id:
        contacts = await tybot.list_by_table(
            CONTACTS_TABLE_ID, {"limit": 500, "offset": 0, "where": f"(events_id,eq,{event_id})"}
        )
        contact_rows = contacts.get("list", contacts) if isinstance(contacts, dict) else contacts
        contact_ids = {r.get("id") for r in contact_rows}

        raw = await tybot.list_by_table(TABLE_ID, {"limit": 500, "offset": 0})
        rows = raw.get("list", raw) if isinstance(raw, dict) else raw
        rows = [r for r in rows if r.get("contacts_id") in contact_ids]

        start = (page - 1) * limit
        page_rows = rows[start:start + limit]
        if isinstance(raw, dict) and "list" in raw:
            return {**raw, "list": page_rows}
        return page_rows

    params = {"limit": limit, "offset": (page - 1) * limit}
    return await tybot.list_by_table(TABLE_ID, params)


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
    record = await tybot.get_by_table(TABLE_ID, str(exhibitor_id))
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
