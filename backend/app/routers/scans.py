"""
app/routers/scans.py — QR scan recording + participant lookup
Table: scans | Base: Activite (pmr53lflvmgxw) | ID: maf1b42df8c437952

Lookup accepts either:
  - a real badge QR code (badges.qr_code, e.g. "QR-AITF-VIS-0001")
  - the app-generated format "AIEVENT|{id}|{kind}|{code}" where kind is
    "visitor"/"exhibitor" (badge previews rendered in the UI)
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

SCANS_TABLE_ID = "maf1b42df8c437952"       # Activite base
BADGES_TABLE_ID = "mdea2e70ebbb76e7d"      # Participants base
VISITEURS_TABLE_ID = "m3b5a520cdf13cc6e"   # Participants base
EXPOSANTS_TABLE_ID = "m0b2dd0eb02083bf3"   # Participants base

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
        params["where"] = f"(events_id,eq,{event_id})"
    return await tybot.list_by_table(SCANS_TABLE_ID, params)


@router.post("", status_code=201, summary="Record a QR scan")
async def create_scan(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(SCANS_TABLE_ID, data)


@router.get("/{scan_id}", summary="Get scan by ID")
async def get_scan(
    scan_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(SCANS_TABLE_ID, str(scan_id))
    if not record:
        raise HTTPException(status_code=404, detail="Scan not found")
    return record


async def _find_badge_by_qr(tybot: TybotClient, qr: str) -> dict | None:
    try:
        data = await tybot.list_by_table(BADGES_TABLE_ID, {"limit": 500})
    except Exception:
        return None
    for b in data.get("list", []):
        if str(b.get("qr_code") or "") == qr:
            return b
    return None


@router.post("/lookup", summary="Lookup participant by scanned QR code and record the scan")
async def lookup_qr(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    """
    Accepts { qr_data: str, event_id?: int, scan_point?: str }
    Returns participant info and records the scan in the Activite base.
    """
    qr_data: str = (data.get("qr_data") or "").strip()
    event_id = data.get("event_id")
    scan_point = data.get("scan_point") or "Scanner mobile"

    if not qr_data:
        raise HTTPException(status_code=422, detail="QR code vide")

    participant: dict | None = None
    participant_kind = "visitor"
    badge: dict | None = None

    # 1) Real badge QR code
    badge = await _find_badge_by_qr(tybot, qr_data)
    if badge:
        if badge.get("visiteurs_id"):
            participant = await tybot.get_by_table(VISITEURS_TABLE_ID, str(badge["visiteurs_id"]))
            participant_kind = "visitor"
        elif badge.get("exposants_id"):
            participant = await tybot.get_by_table(EXPOSANTS_TABLE_ID, str(badge["exposants_id"]))
            participant_kind = "exhibitor"
        else:
            # badge belongs to vip/staff/sponsor/partenaire — return the embedded ref
            for kind in ("vip", "staff", "sponsors", "partenaires"):
                if badge.get(kind):
                    participant = badge[kind]
                    participant_kind = kind
                    break

    # 2) App-generated format AIEVENT|{id}|{kind}|{code}
    elif qr_data.startswith("AIEVENT|"):
        parts = qr_data.split("|")
        try:
            pid = int(parts[1])
        except (IndexError, ValueError):
            raise HTTPException(status_code=422, detail="Format de QR code invalide")
        kind = parts[2] if len(parts) > 2 else "visitor"
        if kind == "exhibitor":
            participant = await tybot.get_by_table(EXPOSANTS_TABLE_ID, str(pid))
            participant_kind = "exhibitor"
        else:
            participant = await tybot.get_by_table(VISITEURS_TABLE_ID, str(pid))
            participant_kind = "visitor"

    if not participant:
        raise HTTPException(status_code=404, detail="Participant introuvable pour ce QR code")

    # ── Record the scan (best effort) ───────────────────────────────────────────
    scan_payload: dict = {
        "scan_type": "event_entry",
        "direction": "in",
        "scan_point_name": scan_point,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }
    if event_id:
        scan_payload["events_id"] = event_id
    elif participant.get("events_id"):
        scan_payload["events_id"] = participant["events_id"]
    if badge:
        scan_payload["badges_id"] = badge.get("id")
    if participant_kind == "visitor":
        scan_payload["visiteurs_id"] = participant.get("id")
    elif participant_kind == "exhibitor":
        scan_payload["exposants_id"] = participant.get("id")

    try:
        await tybot.create(SCANS_TABLE_ID, scan_payload)
    except Exception:
        pass  # don't fail the lookup if scan recording fails

    return {
        "status": "success",
        "participant_kind": participant_kind,
        "visitor": participant,
        "badge": badge,
        "badge_type": participant_kind,
        "badge_number": (badge or {}).get("badge_number"),
    }
