"""
app/routers/venues.py — CRUD for venues via TybotFlow SmartDB
Table: venues | Base: Evenements (pmr53j9yjvo1c) | ID: maeaf41fb5ddb9049

A venue can host many events: the FK lives on the event side
(events.venues_id), and each venue record embeds the reverse array as
"events". There is no events_id column on venues itself (an older,
one-venue-per-event column by that name existed briefly and was removed
when the relation was redirected) — filtering by event_id below checks
each venue's embedded "events" array in Python instead of a `where` clause.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "maeaf41fb5ddb9049"

router = APIRouter(prefix="/api/v1/venues", tags=["Venues"])


@router.get("", summary="List venues")
async def list_venues(
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    if event_id:
        raw = await tybot.list_by_table(TABLE_ID, {"limit": 500, "offset": 0})
        rows = raw.get("list", raw) if isinstance(raw, dict) else raw
        rows = [r for r in rows if any(e.get("id") == event_id for e in (r.get("events") or []))]

        start = (page - 1) * limit
        page_rows = rows[start:start + limit]
        if isinstance(raw, dict) and "list" in raw:
            return {**raw, "list": page_rows}
        return page_rows

    params = {"limit": limit, "offset": (page - 1) * limit}
    return await tybot.list_by_table(TABLE_ID, params)


@router.post("", status_code=201, summary="Create venue")
async def create_venue(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{venue_id}", summary="Get venue by ID")
async def get_venue(
    venue_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(venue_id))
    if not record:
        raise HTTPException(status_code=404, detail="Venue not found")
    return record


@router.patch("/{venue_id}", summary="Update venue")
async def update_venue(
    venue_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = venue_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{venue_id}", summary="Delete venue")
async def delete_venue(
    venue_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(venue_id))
    return {"message": "Deleted"}
