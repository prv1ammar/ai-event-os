"""
app/services/event_service.py
──────────────────────────────
Business logic for the Event entity.

All functions receive an AsyncSession and return ORM objects
(serialised by the router's response_model).
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.event import Event
from app.models.exhibitor import Exhibitor
from app.models.lead import Lead
from app.models.payment import Payment
from app.models.session import Session, Speaker
from app.models.visitor import Visitor
from app.schemas.event import EventCreate, EventUpdate


# ── Helpers ────────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    """Convert a string to a URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-") or str(uuid.uuid4())[:8]


async def _unique_slug(db: AsyncSession, base_slug: str) -> str:
    """Append a short UUID suffix if slug already exists in DB."""
    result = await db.execute(select(Event).where(Event.slug == base_slug))
    if result.scalar_one_or_none() is None:
        return base_slug
    return f"{base_slug}-{str(uuid.uuid4())[:6]}"


async def _get_or_404(db: AsyncSession, event_id: uuid.UUID) -> Event:
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found",
        )
    return event


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def get_all(
    db: AsyncSession,
    status_filter: Optional[str],
    category: Optional[str],
    year: Optional[int],
    page: int,
    limit: int,
) -> list[Event]:
    query = select(Event)

    if status_filter:
        query = query.where(Event.status == status_filter)
    if category:
        query = query.where(Event.category == category)
    if year:
        query = query.where(extract("year", Event.start_date) == year)

    query = (
        query
        .order_by(Event.start_date.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, event_id: uuid.UUID) -> Event:
    return await _get_or_404(db, event_id)


async def create(db: AsyncSession, data: EventCreate, current_user) -> Event:
    # Only admin/organizer may create events (enforced by router dependency;
    # service layer adds an explicit guard for defence-in-depth).
    if getattr(current_user, "role", None) not in ("admin", "organizer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and organizers can create events",
        )

    base_slug = data.slug or _slugify(data.name)
    slug = await _unique_slug(db, base_slug)

    event = Event(
        name=data.name,
        slug=slug,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        venue=data.venue,
        city=data.city,
        country=data.country,
        capacity=data.capacity,
        category=data.category,
        budget=int(data.budget_mad) if data.budget_mad is not None else None,
        logo_url=data.logo_url,
        status="draft",
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event


async def update(
    db: AsyncSession,
    event_id: uuid.UUID,
    data: EventUpdate,
) -> Event:
    event = await _get_or_404(db, event_id)

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if field == "budget_mad":
            event.budget = int(value) if value is not None else None
        else:
            setattr(event, field, value)

    await db.flush()
    await db.refresh(event)
    return event


async def delete(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """Soft-delete: set status to 'cancelled' (archived)."""
    event = await _get_or_404(db, event_id)
    event.status = "cancelled"
    await db.flush()
    return {"message": f"Event '{event.name}' has been archived"}


# ── Stats & Dashboard ──────────────────────────────────────────────────────────

async def get_stats(db: AsyncSession, event_id: uuid.UUID) -> dict:
    # Ensure event exists
    await _get_or_404(db, event_id)

    # Total visitors
    visitors_q = await db.execute(
        select(func.count(Visitor.id)).where(Visitor.event_id == event_id)
    )
    total_visitors: int = visitors_q.scalar() or 0

    # Confirmed visitors (those with at least one confirmed ticket)
    from app.models.ticket import Ticket
    confirmed_q = await db.execute(
        select(func.count(Ticket.id))
        .where(Ticket.event_id == event_id, Ticket.status == "confirmed")
    )
    confirmed_visitors: int = confirmed_q.scalar() or 0

    # Total exhibitors
    exhibitors_q = await db.execute(
        select(func.count(Exhibitor.id)).where(Exhibitor.event_id == event_id)
    )
    total_exhibitors: int = exhibitors_q.scalar() or 0

    # Revenue — sum of paid payments for the event
    revenue_q = await db.execute(
        select(func.coalesce(func.sum(Payment.amount_mad), 0))
        .where(Payment.event_id == event_id, Payment.status == "paid")
    )
    total_revenue_mad: float = float(revenue_q.scalar() or 0)

    # Total leads
    leads_q = await db.execute(
        select(func.count(Lead.id)).where(Lead.event_id == event_id)
    )
    total_leads: int = leads_q.scalar() or 0

    # Occupancy rate
    from app.models.booth import Booth
    total_booths_q = await db.execute(
        select(func.count(Booth.id)).where(Booth.event_id == event_id)
    )
    total_booths: int = total_booths_q.scalar() or 0

    non_available_q = await db.execute(
        select(func.count(Booth.id))
        .where(Booth.event_id == event_id, Booth.status != "available")
    )
    non_available: int = non_available_q.scalar() or 0
    occupancy_rate = (non_available / total_booths) if total_booths > 0 else 0.0

    return {
        "event_id": event_id,
        "total_visitors": total_visitors,
        "total_exhibitors": total_exhibitors,
        "total_revenue_mad": total_revenue_mad,
        "total_leads": total_leads,
        "confirmed_visitors": confirmed_visitors,
        "occupancy_rate": round(occupancy_rate, 4),
    }


async def get_dashboard(db: AsyncSession, event_id: uuid.UUID) -> dict:
    event = await _get_or_404(db, event_id)
    stats = await get_stats(db, event_id)

    # 5 most recently registered exhibitors
    recent_exhibitors_q = await db.execute(
        select(Exhibitor)
        .where(Exhibitor.event_id == event_id)
        .order_by(Exhibitor.created_at.desc())
        .limit(5)
    )
    recent_exhibitors = list(recent_exhibitors_q.scalars().all())

    # Next 5 upcoming sessions (after now)
    now = datetime.now(timezone.utc)
    upcoming_sessions_q = await db.execute(
        select(Session)
        .where(Session.event_id == event_id, Session.start_time >= now)
        .order_by(Session.start_time.asc())
        .limit(5)
    )
    upcoming_sessions = list(upcoming_sessions_q.scalars().all())

    return {
        "event": event,
        "stats": stats,
        "recent_exhibitors": recent_exhibitors,
        "upcoming_sessions": upcoming_sessions,
    }
