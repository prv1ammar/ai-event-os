"""
app/services/prediction_service.py
────────────────────────────────────
No-show prediction and risk scoring for registered visitors.

Risk factors (additive score, higher = more likely to no-show)
──────────────────────────────────────────────────────────────
+40  Registered > 60 days ago, no session attendance
+30  Registered > 30 days ago, no booth scan
+25  Free / pending ticket (no payment confirmed)
+20  No meetings scheduled
+15  Has not attended any session
+10  Single-day registration (no multi-day engagement)
-20  VIP visitor type
-15  Has at least one confirmed meeting
-10  Attended ≥ 2 sessions

Risk levels
───────────
high     score ≥ 50
medium   score 25–49
low      score < 25
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.lead import Meeting
from app.models.session_attendance import SessionAttendance
from app.models.ticket import QRScan, Ticket
from app.models.visitor import Visitor


# ── Private helpers ────────────────────────────────────────────────────────────

async def _require_event(db: AsyncSession, event_id: uuid.UUID) -> Event:
    from sqlalchemy import select as _select

    result = await db.execute(_select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found",
        )
    return event


def _risk_level(score: int) -> str:
    if score >= 50:
        return "high"
    elif score >= 25:
        return "medium"
    return "low"


def _recommended_action(risk: str) -> str:
    actions = {
        "high": "Send J-1 urgency reminder + personal phone call",
        "medium": "Send automated reminder email with event highlights",
        "low": "Send standard logistics email (schedule, parking, etc.)",
    }
    return actions.get(risk, "No action required")


# ── Per-visitor risk scoring ───────────────────────────────────────────────────

async def _score_visitor_risk(
    db: AsyncSession,
    visitor: Visitor,
    now: datetime,
) -> dict[str, Any]:
    """Compute a no-show risk score for a single visitor."""
    risk_score = 0
    risk_factors: list[str] = []

    # ── Days since registration ────────────────────────────────────────────────
    if visitor.created_at:
        created = visitor.created_at
        if hasattr(created, "tzinfo") and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        days_since_reg = max((now - created).days, 0)
    else:
        days_since_reg = 0

    # ── Sessions attended ──────────────────────────────────────────────────────
    sessions_attended = (await db.execute(
        select(func.count(SessionAttendance.id)).where(
            SessionAttendance.visitor_id == visitor.id
        )
    )).scalar() or 0

    # ── Booth scans ────────────────────────────────────────────────────────────
    booth_scans = (await db.execute(
        select(func.count(QRScan.id)).where(
            QRScan.visitor_id == visitor.id,
            QRScan.scan_type.in_(["entry", "booth"]),
        )
    )).scalar() or 0

    # ── Meetings scheduled ─────────────────────────────────────────────────────
    meetings = (await db.execute(
        select(func.count(Meeting.id)).where(
            Meeting.visitor_id == visitor.id
        )
    )).scalar() or 0

    # ── Ticket status ──────────────────────────────────────────────────────────
    ticket_result = await db.execute(
        select(Ticket.status, Ticket.pack).where(
            Ticket.visitor_id == visitor.id
        ).limit(1)
    )
    ticket_row = ticket_result.first()
    ticket_status = ticket_row[0] if ticket_row else None
    ticket_pack = ticket_row[1] if ticket_row else None

    # ── Apply risk factors ─────────────────────────────────────────────────────
    if days_since_reg > 60 and sessions_attended == 0:
        risk_score += 40
        risk_factors.append("Registered > 60 days ago with no session attendance")

    if days_since_reg > 30 and booth_scans == 0:
        risk_score += 30
        risk_factors.append("Registered > 30 days ago with no booth activity")

    if ticket_status in (None, "pending"):
        risk_score += 25
        risk_factors.append("No confirmed ticket / payment")

    if meetings == 0:
        risk_score += 20
        risk_factors.append("No B2B meetings scheduled")

    if sessions_attended == 0:
        risk_score += 15
        risk_factors.append("Has not registered for any session")

    # ── Positive signals (reduce risk) ────────────────────────────────────────
    if visitor.type == "vip":
        risk_score -= 20
        risk_factors.append("VIP visitor (lower no-show rate)")

    if meetings >= 1:
        risk_score -= 15
        risk_factors.append("Has confirmed B2B meeting")

    if sessions_attended >= 2:
        risk_score -= 10
        risk_factors.append("Attended multiple sessions (high engagement)")

    risk_score = max(0, risk_score)

    return {
        "visitor_id": str(visitor.id),
        "name": f"{visitor.first_name} {visitor.last_name}",
        "email": visitor.email,
        "company": visitor.company,
        "type": visitor.type,
        "risk_score": risk_score,
        "risk_level": _risk_level(risk_score),
        "risk_factors": risk_factors,
        "days_since_registration": days_since_reg,
        "sessions_attended": sessions_attended,
        "meetings_scheduled": meetings,
        "has_confirmed_ticket": ticket_status == "confirmed",
    }


# ── Public API ─────────────────────────────────────────────────────────────────

async def predict_no_shows(
    db: AsyncSession,
    event_id: uuid.UUID,
) -> dict:
    """
    Predict visitors unlikely to attend and group them by risk level.

    Returns
    ───────
    {
        "event_id": "...",
        "total_registered": 1400,
        "predicted_no_shows": 116,
        "no_show_rate_pct": 8.3,
        "high_risk": [...],
        "medium_risk": [...],
        "low_risk": [...],
        "recommended_action": "Send J-1 urgency reminder to high-risk list"
    }
    """
    event = await _require_event(db, event_id)

    # Load all visitors for this event
    visitors_result = await db.execute(
        select(Visitor).where(Visitor.event_id == event_id)
    )
    visitors = visitors_result.scalars().all()

    now = datetime.now(timezone.utc)

    high_risk: list[dict] = []
    medium_risk: list[dict] = []
    low_risk: list[dict] = []

    for visitor in visitors:
        scored = await _score_visitor_risk(db, visitor, now)
        level = scored["risk_level"]
        if level == "high":
            high_risk.append(scored)
        elif level == "medium":
            medium_risk.append(scored)
        else:
            low_risk.append(scored)

    # Sort by risk score descending within each bucket
    high_risk.sort(key=lambda x: x["risk_score"], reverse=True)
    medium_risk.sort(key=lambda x: x["risk_score"], reverse=True)

    predicted_no_shows = len(high_risk) + len(medium_risk)
    total = len(visitors)
    no_show_rate = round((predicted_no_shows / total * 100) if total > 0 else 0.0, 1)

    # Dominant action based on majority risk bucket
    if high_risk:
        action = _recommended_action("high")
    elif medium_risk:
        action = _recommended_action("medium")
    else:
        action = _recommended_action("low")

    return {
        "event_id": str(event_id),
        "event_name": event.name,
        "total_registered": total,
        "predicted_no_shows": predicted_no_shows,
        "no_show_rate_pct": no_show_rate,
        "high_risk_count": len(high_risk),
        "medium_risk_count": len(medium_risk),
        "low_risk_count": len(low_risk),
        "high_risk": high_risk[:50],    # cap list size in response
        "medium_risk": medium_risk[:50],
        "recommended_action": action,
    }


async def get_visitor_risk(
    db: AsyncSession,
    visitor_id: uuid.UUID,
) -> dict:
    """Return the no-show risk score for a single visitor."""
    result = await db.execute(select(Visitor).where(Visitor.id == visitor_id))
    visitor = result.scalar_one_or_none()
    if visitor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visitor {visitor_id} not found",
        )
    now = datetime.now(timezone.utc)
    return await _score_visitor_risk(db, visitor, now)
