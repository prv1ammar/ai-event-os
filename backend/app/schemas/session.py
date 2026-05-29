"""
app/schemas/session.py
──────────────────────
Pydantic v2 request/response schemas for Session and session attendance.

Session types: keynote | panel | workshop | roundtable | networking | demo
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


# ── Base ───────────────────────────────────────────────────────────────────────

class SessionBase(BaseModel):
    title: str
    description: Optional[str] = None
    session_type: str = "keynote"
    room: Optional[str] = None
    capacity: Optional[int] = None
    start_time: datetime
    end_time: datetime

    @field_validator("session_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        allowed = {"keynote", "panel", "workshop", "roundtable", "networking", "demo"}
        if v not in allowed:
            raise ValueError(f"session_type must be one of {allowed}")
        return v

    @model_validator(mode="after")
    def end_after_start(self) -> "SessionBase":
        if self.end_time and self.start_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


# ── Create / Update ────────────────────────────────────────────────────────────

class SessionCreate(SessionBase):
    event_id: UUID
    speaker_ids: Optional[list[UUID]] = []   # optional pre-assign speakers


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    session_type: Optional[str] = None
    room: Optional[str] = None
    capacity: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


# ── Speaker brief (nested inside SessionResponse) ──────────────────────────────

class SpeakerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    first_name: str
    last_name: str
    company: Optional[str] = None
    photo_url: Optional[str] = None


# ── Response ───────────────────────────────────────────────────────────────────

class SessionResponse(SessionBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    event_id: UUID
    speakers: list[SpeakerBrief] = []
    created_at: datetime
    updated_at: datetime


# ── Registration ───────────────────────────────────────────────────────────────

class SessionRegistrationRequest(BaseModel):
    visitor_id: UUID


class SessionRegistrationResponse(BaseModel):
    session_id: UUID
    visitor_id: UUID
    registered_at: datetime
    message: str = "Registration successful"


# ── Attendance list ────────────────────────────────────────────────────────────

class AttendeeInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    visitor_id: UUID
    registered_at: datetime


class SessionAttendanceResponse(BaseModel):
    session_id: UUID
    session_title: str
    total_registered: int
    capacity: Optional[int] = None
    attendees: list[AttendeeInfo]
