"""
app/routers/public.py
─────────────────────
Public endpoints — no authentication required.
Used by landing pages for visitor/exhibitor registration and programme display.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.core.tybot_client import TybotClient, get_tybot

router = APIRouter(prefix="/api/v1/public", tags=["Public"])

VISITORS_TABLE_ID  = "mczsulpngbjjif5"
EXHIBITORS_TABLE_ID = "mrdg571gqvhuiz0"
SESSIONS_TABLE     = "sessions"


# ── Visitor registration ───────────────────────────────────────────────────────

class VisitorRegistration(BaseModel):
    firstname: str
    lastname: str
    email: EmailStr
    company: Optional[str] = None
    sector: Optional[str] = None
    event_id: Optional[int] = None
    visitor_type: str = "standard"
    source: str = "landing_page"


@router.post("/register", summary="Public visitor registration from landing page")
async def register_visitor(data: VisitorRegistration, tybot: TybotClient = Depends(get_tybot)):
    payload = data.model_dump(exclude_none=True)
    result = await tybot.create(VISITORS_TABLE_ID, payload)
    return {"status": "registered", "id": result.get("Id")}


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
    export_experience: str = "regional"
    event_id: Optional[int] = None
    source: str = "landing_page"


@router.post("/register-exhibitor", summary="Public exhibitor registration from landing page")
async def register_exhibitor(data: ExhibitorRegistration, tybot: TybotClient = Depends(get_tybot)):
    payload = data.model_dump(exclude_none=True)
    payload.pop("contact_name", None)
    payload.pop("booth_preference", None)
    payload.pop("source", None)
    result = await tybot.create(EXHIBITORS_TABLE_ID, payload)
    return {"status": "registered", "id": result.get("Id")}


# ── Public sessions (programme) ────────────────────────────────────────────────

@router.get("/sessions", summary="Public session list for landing page programme")
async def public_sessions(
    event_id: Optional[int] = Query(None),
    tybot: TybotClient = Depends(get_tybot),
):
    params: dict = {"limit": 50, "offset": 0}
    records = await tybot.list(SESSIONS_TABLE, params)
    if event_id:
        records = [r for r in records if r.get("event_id") == event_id]
    records.sort(key=lambda r: r.get("start_time") or "")
    return records
