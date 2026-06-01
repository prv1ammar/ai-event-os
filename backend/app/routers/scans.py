"""
app/routers/scans.py — QR scan recording + visitor lookup
Table: qr_scans | ID: mfvqg4myn20sf2l
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "qr_scans"
TABLE_ID = "mfvqg4myn20sf2l"
VISITORS_TABLE = "visitors"
BADGES_TABLE = "badges"

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


@router.post("/lookup", summary="Lookup visitor by scanned QR code and record the scan")
async def lookup_qr(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    """
    Accepts { qr_data: "AIEVENT|visitor_id|badge_type|badge_number", event_id?: int }
    Returns visitor info and records the scan.
    """
    qr_data: str = data.get("qr_data", "")
    event_id = data.get("event_id")

    # Parse QR format: AIEVENT|{visitor_id}|{badge_type}|{badge_number}
    visitor_id = None
    badge_type = None
    badge_number = None

    if qr_data.startswith("AIEVENT|"):
        parts = qr_data.split("|")
        if len(parts) >= 2:
            try:
                visitor_id = int(parts[1])
            except ValueError:
                pass
        badge_type = parts[2] if len(parts) > 2 else None
        badge_number = parts[3] if len(parts) > 3 else None

    if not visitor_id:
        raise HTTPException(status_code=422, detail="Invalid QR code format")

    # Find the visitor
    visitors = await tybot.list(VISITORS_TABLE, {"limit": 500})
    visitor = next((v for v in visitors if str(v.get("id", "")) == str(visitor_id)), None)

    if not visitor:
        raise HTTPException(status_code=404, detail="Visiteur introuvable")

    # Find badge if available
    badge = None
    if visitor.get("badges_id"):
        badges = await tybot.list(BADGES_TABLE, {"limit": 500})
        badge = next((b for b in badges if str(b.get("id", "")) == str(visitor["badges_id"])), None)

    # Record the scan
    scan_payload = {
        "qr_code": qr_data,
        "scan_time": datetime.now(timezone.utc).isoformat(),
        "badge_type": badge_type or visitor.get("visitor_type", "standard"),
        "status": "success",
    }
    if event_id:
        scan_payload["event_id"] = event_id
    if visitor_id:
        scan_payload["visitor_id"] = visitor_id

    try:
        await tybot.create(TABLE_ID, scan_payload)
    except Exception:
        pass  # don't fail the lookup if scan recording fails

    return {
        "status": "success",
        "visitor": visitor,
        "badge": badge,
        "badge_type": badge_type or visitor.get("visitor_type", "standard"),
        "badge_number": badge_number or badge.get("badge_number") if badge else None,
    }
