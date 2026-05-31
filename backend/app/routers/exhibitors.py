"""
app/routers/exhibitors.py — CRUD for exhibitors via TybotFlow SmartDB
Table: exhibitors | ID: mrdg571gqvhuiz0

event_ids is a comma-separated text field, e.g. "1,4,5"
One exhibitor can belong to multiple events.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "exhibitors"
TABLE_ID = "mrdg571gqvhuiz0"

router = APIRouter(prefix="/api/v1/exhibitors", tags=["Exhibitors"])


def _has_event(row: dict, event_id: int) -> bool:
    raw = row.get("event_ids") or ""
    return str(event_id) in [v.strip() for v in str(raw).split(",") if v.strip()]


@router.get("", summary="List exhibitors")
async def list_exhibitors(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    rows = await tybot.list(TABLE, {"limit": 500})
    if event_id is not None:
        rows = [r for r in rows if _has_event(r, event_id)]
    start = (page - 1) * limit
    return rows[start : start + limit]


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


@router.post("/{exhibitor_id}/assign-event", summary="Assign exhibitor to an event")
async def assign_event(
    exhibitor_id: int,
    body: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    event_id = body.get("event_id")
    if not event_id:
        raise HTTPException(status_code=422, detail="event_id required")
    record = await tybot.get(TABLE, str(exhibitor_id))
    if not record:
        raise HTTPException(status_code=404, detail="Exhibitor not found")
    ids = [v.strip() for v in str(record.get("event_ids") or "").split(",") if v.strip()]
    if str(event_id) in ids:
        raise HTTPException(status_code=409, detail="Already assigned to this event")
    ids.append(str(event_id))
    await tybot.update(TABLE_ID, {"id": exhibitor_id, "event_ids": ",".join(ids)})
    return {"event_ids": ",".join(ids)}


@router.post("/{exhibitor_id}/unassign-event", summary="Remove exhibitor from an event")
async def unassign_event(
    exhibitor_id: int,
    body: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    event_id = body.get("event_id")
    if not event_id:
        raise HTTPException(status_code=422, detail="event_id required")
    record = await tybot.get(TABLE, str(exhibitor_id))
    if not record:
        raise HTTPException(status_code=404, detail="Exhibitor not found")
    ids = [v.strip() for v in str(record.get("event_ids") or "").split(",") if v.strip() and v.strip() != str(event_id)]
    await tybot.update(TABLE_ID, {"id": exhibitor_id, "event_ids": ",".join(ids)})
    return {"event_ids": ",".join(ids)}


@router.delete("/{exhibitor_id}", summary="Delete exhibitor")
async def delete_exhibitor(
    exhibitor_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(exhibitor_id))
    return {"message": "Deleted"}
