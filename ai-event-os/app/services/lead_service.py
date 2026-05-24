"""
app/services/lead_service.py
─────────────────────────────
Business logic for the lead pipeline.

Score weights (0-100 cap):
  profile_complete   +20   all key visitor fields filled
  session_attended   +15   per confirmed session (max 3)
  booth_scan         +10   per booth QR scan (max 3)
  meeting_booked     +25   meeting in pending state
  meeting_confirmed  +35   meeting status = confirmed
  budget_50k_mad     +30   declared budget 50k–100k MAD
  budget_100k_mad    +50   declared budget > 100k MAD
  decision_maker     +20   visitor role matches CEO / Director / etc.
  returning_visitor  +15   same email found in another event
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lead import Lead, Meeting
from app.models.visitor import Visitor
from app.models.exhibitor import Exhibitor
from app.models.event import Event
from app.models.session_attendance import SessionAttendance
from app.models.ticket import QRScan
from app.schemas.lead import LeadCreate, LeadUpdate, LeadStatusUpdate, ScheduleMeetingFromLead

# ── Scoring weights ────────────────────────────────────────────────────────────

SCORE_WEIGHTS: dict[str, int] = {
    "profile_complete":  20,
    "session_attended":  15,
    "booth_scan":        10,
    "meeting_booked":    25,
    "meeting_confirmed": 35,
    "budget_50k_mad":    30,
    "budget_100k_mad":   50,
    "decision_maker":    20,
    "returning_visitor": 15,
}

DECISION_KEYWORDS = {
    "ceo", "pdg", "dg", "directeur", "director", "president", "président",
    "coo", "cfo", "vp", "vice-president", "responsable achat", "purchasing",
    "manager", "chef", "gérant", "fondateur", "founder", "associé",
}

BUDGET_100K_MARKERS = {"100k", "100000", "200k", "500k", "1m", "million", "mdh"}
BUDGET_50K_MARKERS  = {"50k", "50000", "60k", "70k", "75k", "80k"}


# ── Helpers ────────────────────────────────────────────────────────────────────

def score_to_status(score: int) -> str:
    """Map a numeric score (0-100) to the automatic lead status."""
    if score <= 30:
        return "new"
    elif score <= 55:
        return "contacted"
    elif score <= 75:
        return "qualified"
    else:
        return "opportunity"


async def _get_or_404(db: AsyncSession, lead_id: uuid.UUID) -> Lead:
    result = await db.execute(
        select(Lead)
        .options(selectinload(Lead.visitor), selectinload(Lead.exhibitor))
        .where(Lead.id == lead_id)
    )
    lead = result.scalar_one_or_none()
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Lead {lead_id} not found")
    return lead


# ── Score calculation ──────────────────────────────────────────────────────────

async def calculate_lead_score(db: AsyncSession, lead_id: uuid.UUID) -> int:
    """
    Rule-based score (0-100).
    Designed to be called from the API and from scoring_tasks.py.
    """
    lead_result = await db.execute(
        select(Lead)
        .options(selectinload(Lead.visitor))
        .where(Lead.id == lead_id)
    )
    lead = lead_result.scalar_one_or_none()
    if not lead:
        return 0

    visitor = lead.visitor
    if not visitor:
        return 0

    score = 0

    # 1. Profile completeness
    key_fields = [visitor.first_name, visitor.last_name,
                  visitor.email, visitor.phone, visitor.company, visitor.role]
    if all(key_fields):
        score += SCORE_WEIGHTS["profile_complete"]

    # 2. Sessions attended (cap at 3 sessions)
    sess_q = await db.execute(
        select(func.count(SessionAttendance.id))
        .where(SessionAttendance.visitor_id == visitor.id)
    )
    sessions_count = min(sess_q.scalar() or 0, 3)
    score += sessions_count * SCORE_WEIGHTS["session_attended"]

    # 3. Booth QR scans (cap at 3)
    scan_q = await db.execute(
        select(func.count(QRScan.id))
        .where(QRScan.visitor_id == visitor.id, QRScan.scan_type == "booth")
    )
    scan_count = min(scan_q.scalar() or 0, 3)
    score += scan_count * SCORE_WEIGHTS["booth_scan"]

    # 4. B2B meetings with this specific exhibitor
    meeting_q = await db.execute(
        select(Meeting).where(
            Meeting.visitor_id == visitor.id,
            Meeting.exhibitor_id == lead.exhibitor_id,
        )
    )
    for meeting in meeting_q.scalars().all():
        if meeting.status == "confirmed":
            score += SCORE_WEIGHTS["meeting_confirmed"]
        elif meeting.status == "pending":
            score += SCORE_WEIGHTS["meeting_booked"]

    # 5. Budget range
    if lead.budget_range:
        br = lead.budget_range.lower().replace(" ", "").replace(",", "")
        if any(m in br for m in BUDGET_100K_MARKERS):
            score += SCORE_WEIGHTS["budget_100k_mad"]
        elif any(m in br for m in BUDGET_50K_MARKERS):
            score += SCORE_WEIGHTS["budget_50k_mad"]

    # 6. Decision-maker role
    if visitor.role:
        role_lower = visitor.role.lower()
        if any(kw in role_lower for kw in DECISION_KEYWORDS):
            score += SCORE_WEIGHTS["decision_maker"]

    # 7. Returning visitor (same email appears in another event)
    returning_q = await db.execute(
        select(func.count(Visitor.id)).where(
            Visitor.email == visitor.email,
            Visitor.id != visitor.id,
        )
    )
    if (returning_q.scalar() or 0) > 0:
        score += SCORE_WEIGHTS["returning_visitor"]

    return min(score, 100)


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def get_all(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    exhibitor_id: Optional[uuid.UUID],
    status_filter: Optional[str],
    min_score: Optional[int],
    page: int,
    limit: int,
) -> list[Lead]:
    query = (
        select(Lead)
        .options(selectinload(Lead.visitor), selectinload(Lead.exhibitor))
    )
    if event_id:
        query = query.where(Lead.event_id == event_id)
    if exhibitor_id:
        query = query.where(Lead.exhibitor_id == exhibitor_id)
    if status_filter:
        query = query.where(Lead.status == status_filter)
    if min_score is not None:
        query = query.where(Lead.score >= min_score)

    query = query.order_by(Lead.score.desc().nullslast(), Lead.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, lead_id: uuid.UUID) -> Lead:
    return await _get_or_404(db, lead_id)


async def create(db: AsyncSession, data: LeadCreate) -> Lead:
    # Verify foreign keys exist
    for model, fk_id, label in [
        (Event,     data.event_id,     "Event"),
        (Visitor,   data.visitor_id,   "Visitor"),
        (Exhibitor, data.exhibitor_id, "Exhibitor"),
    ]:
        row = await db.execute(select(model).where(model.id == fk_id))
        if row.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} {fk_id} not found")

    lead = Lead(
        visitor_id=data.visitor_id,
        exhibitor_id=data.exhibitor_id,
        event_id=data.event_id,
        status=data.status,
        notes=data.notes,
        budget_range=data.budget_range,
        score=0,
    )
    db.add(lead)
    await db.flush()
    await db.refresh(lead)

    # Compute initial score after creation
    computed_score = await calculate_lead_score(db, lead.id)
    lead.score = computed_score
    lead.status = score_to_status(computed_score)
    await db.flush()

    # Reload with relationships
    return await _get_or_404(db, lead.id)


async def update(
    db: AsyncSession,
    lead_id: uuid.UUID,
    data: LeadUpdate,
) -> Lead:
    lead = await _get_or_404(db, lead_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(lead, field, value)
    await db.flush()
    return await _get_or_404(db, lead_id)


async def update_status(
    db: AsyncSession,
    lead_id: uuid.UUID,
    data: LeadStatusUpdate,
) -> Lead:
    lead = await _get_or_404(db, lead_id)
    lead.status = data.status
    await db.flush()
    return await _get_or_404(db, lead_id)


async def delete(db: AsyncSession, lead_id: uuid.UUID) -> dict:
    lead = await _get_or_404(db, lead_id)
    await db.delete(lead)
    await db.flush()
    return {"message": f"Lead {lead_id} deleted"}


# ── Funnel stats ───────────────────────────────────────────────────────────────

async def get_funnel_stats(db: AsyncSession, event_id: uuid.UUID) -> dict:
    # Verify event exists
    ev = await db.execute(select(Event).where(Event.id == event_id))
    if ev.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Event {event_id} not found")

    leads_q = await db.execute(
        select(Lead).where(Lead.event_id == event_id)
    )
    leads = leads_q.scalars().all()

    by_status: dict[str, int] = {}
    total_score = 0
    top_leads = 0

    for lead in leads:
        by_status[lead.status] = by_status.get(lead.status, 0) + 1
        sc = lead.score or 0
        total_score += sc
        if sc >= 70:
            top_leads += 1

    total = len(leads)
    avg_score = round(total_score / total, 2) if total > 0 else 0.0

    return {
        "event_id": event_id,
        "total": total,
        "by_status": by_status,
        "avg_score": avg_score,
        "top_leads": top_leads,
    }


# ── Export helpers ─────────────────────────────────────────────────────────────

async def get_leads_for_export(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    exhibitor_id: Optional[uuid.UUID],
    status_filter: Optional[str],
) -> list[Lead]:
    """Return all matching leads (no pagination) for Excel export."""
    query = (
        select(Lead)
        .options(selectinload(Lead.visitor), selectinload(Lead.exhibitor))
    )
    if event_id:
        query = query.where(Lead.event_id == event_id)
    if exhibitor_id:
        query = query.where(Lead.exhibitor_id == exhibitor_id)
    if status_filter:
        query = query.where(Lead.status == status_filter)
    query = query.order_by(Lead.score.desc().nullslast(), Lead.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


# ── Schedule meeting from lead ─────────────────────────────────────────────────

async def schedule_meeting_from_lead(
    db: AsyncSession,
    lead_id: uuid.UUID,
    data: ScheduleMeetingFromLead,
) -> Meeting:
    lead = await _get_or_404(db, lead_id)

    meeting = Meeting(
        visitor_id=lead.visitor_id,
        exhibitor_id=lead.exhibitor_id,
        event_id=lead.event_id,
        scheduled_at=data.scheduled_at,
        duration_min=data.duration_min,
        notes=data.notes,
        status="pending",
    )
    db.add(meeting)

    # Transition lead to "contacted" if still "new"
    if lead.status == "new":
        lead.status = "contacted"

    await db.flush()

    # Reload with relationships so MeetingResponse serialises visitor/exhibitor
    result = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.visitor), selectinload(Meeting.exhibitor))
        .where(Meeting.id == meeting.id)
    )
    return result.scalar_one()
