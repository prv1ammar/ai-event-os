"""
app/schemas/speaker.py
──────────────────────
Pydantic v2 request/response schemas for the Speaker entity.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, AnyHttpUrl


# ── Base ───────────────────────────────────────────────────────────────────────

class SpeakerBase(BaseModel):
    first_name: str
    last_name: str
    company: Optional[str] = None
    bio: Optional[str] = None
    expertise: Optional[str] = None
    linkedin_url: Optional[str] = None
    photo_url: Optional[str] = None


# ── Create / Update ────────────────────────────────────────────────────────────

class SpeakerCreate(SpeakerBase):
    event_id: UUID


class SpeakerUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    bio: Optional[str] = None
    expertise: Optional[str] = None
    linkedin_url: Optional[str] = None
    photo_url: Optional[str] = None


# ── Assign to session ──────────────────────────────────────────────────────────

class SpeakerAssignRequest(BaseModel):
    session_id: UUID


class SpeakerAssignResponse(BaseModel):
    speaker_id: UUID
    session_id: UUID
    message: str = "Speaker assigned to session successfully"


# ── Session brief (nested inside SpeakerResponse) ─────────────────────────────

class SessionBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    session_type: str
    start_time: datetime
    room: Optional[str] = None


# ── Response ───────────────────────────────────────────────────────────────────

class SpeakerResponse(SpeakerBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    event_id: UUID
    sessions: list[SessionBrief] = []
    created_at: datetime
    updated_at: datetime
