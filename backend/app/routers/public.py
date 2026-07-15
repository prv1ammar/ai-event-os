"""
app/routers/public.py
─────────────────────
Public endpoints — no authentication required.
Used by landing pages for visitor/exhibitor registration and programme display.

Writes go to the new Participants base; accepts the legacy landing-page field
names (firstname/lastname/company…) and maps them to the new columns.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.core.tybot_client import TybotClient, get_tybot

router = APIRouter(prefix="/api/v1/public", tags=["Public"])

VISITEURS_TABLE_ID = "m3b5a520cdf13cc6e"   # Participants base
EXPOSANTS_TABLE_ID = "m0b2dd0eb02083bf3"   # Participants base
SESSIONS_TABLE_ID = "mabd59f3b36f4df83"    # Evenements base


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Visitor registration ───────────────────────────────────────────────────────

class VisitorRegistration(BaseModel):
    firstname: str
    lastname: str
    email: EmailStr
    phone: Optional[str] = None
    company: Optional[str] = None
    sector: Optional[str] = None
    event_id: Optional[int] = None
    visitor_type: str = "standard"
    source: str = "landing_page"


@router.post("/register", summary="Public visitor registration from landing page")
async def register_visitor(data: VisitorRegistration, tybot: TybotClient = Depends(get_tybot)):
    payload = {
        "first_name": data.firstname,
        "last_name": data.lastname,
        "email": data.email,
        "registration_status": "pending",
        "registration_date": _now(),
    }
    if data.phone:
        payload["phone"] = data.phone
    if data.event_id:
        payload["events_id"] = data.event_id
    result = await tybot.create(VISITEURS_TABLE_ID, payload)
    return {"status": "registered", "id": result.get("id") or result.get("Id")}


# ── Exhibitor registration ─────────────────────────────────────────────────────

class ExhibitorRegistration(BaseModel):
    company_name: str
    sector: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    contact_name: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    company_size: Optional[str] = None
    employee_count: Optional[int] = None
    booth_preference: Optional[str] = None
    description: Optional[str] = None
    export_experience: Optional[str] = None
    event_id: Optional[int] = None
    source: str = "landing_page"


@router.post("/register-exhibitor", summary="Public exhibitor registration from landing page")
async def register_exhibitor(data: ExhibitorRegistration, tybot: TybotClient = Depends(get_tybot)):
    contact = (data.contact_name or "").strip()
    first, _, last = contact.partition(" ")
    payload = {
        "first_name": first or data.company_name,
        "company_name": data.company_name,
        "email": data.email,
        "registration_status": "pending",
        "registration_date": _now(),
    }
    if last:
        payload["last_name"] = last
    if data.phone:
        payload["phone"] = data.phone
    if data.event_id:
        payload["events_id"] = data.event_id
    result = await tybot.create(EXPOSANTS_TABLE_ID, payload)
    return {"status": "registered", "id": result.get("id") or result.get("Id")}


# ── Public sessions (programme) ────────────────────────────────────────────────

@router.get("/sessions", summary="Public session list for landing page programme")
async def public_sessions(
    event_id: Optional[int] = Query(None),
    tybot: TybotClient = Depends(get_tybot),
):
    params: dict = {"limit": 100}
    if event_id:
        params["where"] = f"(events_id,eq,{event_id})"
    data = await tybot.list_by_table(SESSIONS_TABLE_ID, params)
    records = data.get("list", [])
    records.sort(key=lambda r: r.get("start_time") or "")
    return records
