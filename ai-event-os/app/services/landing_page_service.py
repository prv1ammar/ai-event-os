"""
app/services/landing_page_service.py
──────────────────────────────────────
Business logic for event landing pages and visit tracking.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.landing_page import LandingPage, LandingPageVisit
from app.schemas.landing_page import LandingPageCreate, LandingPageUpdate, TrackVisitRequest


# ── Slug helper ────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-") or str(uuid.uuid4())[:8]


async def _unique_slug(db: AsyncSession, base_slug: str) -> str:
    result = await db.execute(select(LandingPage).where(LandingPage.slug == base_slug))
    if result.scalar_one_or_none() is None:
        return base_slug
    return f"{base_slug}-{str(uuid.uuid4())[:6]}"


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, page_id: uuid.UUID) -> LandingPage:
    result = await db.execute(select(LandingPage).where(LandingPage.id == page_id))
    page = result.scalar_one_or_none()
    if page is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"LandingPage {page_id} not found")
    return page


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def get_all(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    page: int,
    limit: int,
) -> list[LandingPage]:
    query = select(LandingPage)
    if event_id:
        query = query.where(LandingPage.event_id == event_id)
    query = query.order_by(LandingPage.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, page_id: uuid.UUID) -> LandingPage:
    return await _get_or_404(db, page_id)


async def create(db: AsyncSession, data: LandingPageCreate) -> LandingPage:
    ev = await db.execute(select(Event).where(Event.id == data.event_id))
    if ev.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Event {data.event_id} not found")

    base_slug = data.slug or _slugify(data.title)
    slug = await _unique_slug(db, base_slug)

    lp = LandingPage(
        title=data.title,
        slug=slug,
        description=data.description,
        hero_image_url=data.hero_image_url,
        cta_text=data.cta_text,
        is_active=data.is_active,
        event_id=data.event_id,
        visits_count=0,
        registrations_count=0,
    )
    db.add(lp)
    await db.flush()
    await db.refresh(lp)
    return lp


async def update(
    db: AsyncSession,
    page_id: uuid.UUID,
    data: LandingPageUpdate,
) -> LandingPage:
    lp = await _get_or_404(db, page_id)
    updates = data.model_dump(exclude_unset=True)

    if "slug" in updates and updates["slug"]:
        updates["slug"] = await _unique_slug(db, _slugify(updates["slug"]))

    for field, value in updates.items():
        setattr(lp, field, value)

    await db.flush()
    await db.refresh(lp)
    return lp


# ── Stats ──────────────────────────────────────────────────────────────────────

async def get_stats(db: AsyncSession, page_id: uuid.UUID) -> dict:
    lp = await _get_or_404(db, page_id)

    # Visits in last 7 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    recent_q = await db.execute(
        select(func.count(LandingPageVisit.id)).where(
            LandingPageVisit.landing_page_id == page_id,
            LandingPageVisit.visited_at >= cutoff,
        )
    )
    recent_visits = recent_q.scalar() or 0

    visits = lp.visits_count or 0
    regs   = lp.registrations_count or 0
    rate   = round(regs / visits, 4) if visits > 0 else 0.0

    return {
        "landing_page_id":     lp.id,
        "title":               lp.title,
        "visits_count":        visits,
        "registrations_count": regs,
        "conversion_rate":     rate,
        "recent_visits":       recent_visits,
    }


# ── Visit tracking (pixel endpoint) ───────────────────────────────────────────

async def track_visit(
    db: AsyncSession,
    data: TrackVisitRequest,
) -> dict:
    """
    Record one page view.
    Atomically increments visits_count and inserts a LandingPageVisit row.
    No auth required — called by tracking pixel.
    """
    lp = await db.execute(
        select(LandingPage).where(LandingPage.id == data.landing_page_id)
    )
    page = lp.scalar_one_or_none()
    if page is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Landing page not found")

    if not page.is_active:
        raise HTTPException(status.HTTP_410_GONE, "Landing page is inactive")

    # Insert visit row
    visit = LandingPageVisit(
        landing_page_id=page.id,
        ip_address=data.ip_address,
        user_agent=data.user_agent,
        referrer=data.referrer,
        visited_at=datetime.now(timezone.utc),
    )
    db.add(visit)

    # Increment counter
    page.visits_count = (page.visits_count or 0) + 1
    await db.flush()

    return {"status": "tracked", "visits_count": page.visits_count}
