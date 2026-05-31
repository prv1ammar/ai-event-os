"""
app/routers/scans.py — CRUD for QR scans via TybotFlow SmartDB
Table: qr_scans | ID: mfvqg4myn20sf2l
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "qr_scans"
TABLE_ID = "mfvqg4myn20sf2l"

router = APIRouter(prefix="/api/v1/scans", tags=["Scans"])


@router.get("", summary="List QR scans")
async def list_scans(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    if event_id:
        params["where"] = f"(event_id,eq,{event_id})"
    return await tybot.list(TABLE, params)


@router.post("", status_code=201, summary="Record a QR scan")
async def create_scan(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{scan_id}", summary="Get scan by ID")
async def get_scan(
    scan_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get(TABLE, str(scan_id))
    if not record:
        raise HTTPException(status_code=404, detail="Scan not found")
    return record
