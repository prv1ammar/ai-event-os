"""
app/services/campaign_service.py
──────────────────────────────────
Business logic for marketing campaigns.

send_now()  — immediately dispatches email tasks to all recipients
schedule()  — sets scheduled_at; Celery beat will pick it up
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.event import Event
from app.models.visitor import Visitor
from app.models.exhibitor import Exhibitor
from app.models.session import Speaker
from app.schemas.campaign import (
    CampaignCreate,
    CampaignScheduleRequest,
    CampaignUpdate,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, campaign_id: uuid.UUID) -> Campaign:
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Campaign {campaign_id} not found")
    return campaign


async def _get_recipients(
    db: AsyncSession,
    event_id: uuid.UUID,
    audience_type: str,
) -> list[dict]:
    """
    Return list of {email, name} dicts for the given audience_type.
    """
    recipients: list[dict] = []

    if audience_type in ("all_visitors", "vip", "press"):
        query = select(Visitor).where(Visitor.event_id == event_id)
        if audience_type == "vip":
            query = query.where(Visitor.type == "vip")
        elif audience_type == "press":
            query = query.where(Visitor.type == "press")
        result = await db.execute(query)
        for v in result.scalars().all():
            recipients.append({
                "email": v.email,
                "name": f"{v.first_name} {v.last_name}",
            })

    elif audience_type == "exhibitors":
        result = await db.execute(
            select(Exhibitor).where(Exhibitor.event_id == event_id)
        )
        for ex in result.scalars().all():
            recipients.append({
                "email": ex.contact_email,
                "name": ex.contact_name,
            })

    elif audience_type == "speakers":
        result = await db.execute(
            select(Speaker).where(Speaker.event_id == event_id)
        )
        for sp in result.scalars().all():
            recipients.append({
                "email": sp.email,
                "name": f"{sp.first_name} {sp.last_name}",
            })

    # "custom" — caller would inject a recipient list (not implemented here)
    return recipients


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def get_all(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    channel: Optional[str],
    page: int,
    limit: int,
) -> list[Campaign]:
    query = select(Campaign)
    if event_id:
        query = query.where(Campaign.event_id == event_id)
    if channel:
        query = query.where(Campaign.channel == channel)
    query = query.order_by(Campaign.created_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, campaign_id: uuid.UUID) -> Campaign:
    return await _get_or_404(db, campaign_id)


async def create(db: AsyncSession, data: CampaignCreate) -> Campaign:
    ev = await db.execute(select(Event).where(Event.id == data.event_id))
    if ev.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Event {data.event_id} not found")

    campaign = Campaign(
        name=data.name,
        channel=data.channel,
        audience_type=data.audience_type,
        subject=data.subject,
        template_name=data.template_name,
        scheduled_at=data.scheduled_at,
        event_id=data.event_id,
        status="draft",
        sent_count=0,
        click_count=0,
        leads_generated=0,
    )
    db.add(campaign)
    await db.flush()
    await db.refresh(campaign)
    return campaign


async def update(
    db: AsyncSession,
    campaign_id: uuid.UUID,
    data: CampaignUpdate,
) -> Campaign:
    campaign = await _get_or_404(db, campaign_id)
    if campaign.status in ("sending", "sent"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cannot edit a campaign that is sending or already sent",
        )
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(campaign, field, value)
    await db.flush()
    await db.refresh(campaign)
    return campaign


# ── Send ───────────────────────────────────────────────────────────────────────

async def send_now(db: AsyncSession, campaign_id: uuid.UUID) -> Campaign:
    """
    Immediately dispatch email tasks for all matching recipients.
    Works for email channel only; other channels are logged as placeholders.
    """
    campaign = await _get_or_404(db, campaign_id)
    if campaign.status not in ("draft", "scheduled"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Cannot send a campaign with status '{campaign.status}'",
        )

    recipients = await _get_recipients(db, campaign.event_id, campaign.audience_type)

    # Resolve event for template context
    ev_result = await db.execute(select(Event).where(Event.id == campaign.event_id))
    event: Optional[Event] = ev_result.scalar_one_or_none()

    campaign.status = "sending"
    await db.flush()

    if campaign.channel == "email":
        # Guard: Celery may not be present in lightweight test environments
        try:
            from app.tasks.email_tasks import send_single_email
            _has_celery = True
        except (ImportError, ModuleNotFoundError):
            _has_celery = False

        template  = campaign.template_name or "confirmation.html"
        subj      = campaign.subject or f"[{campaign.name}] Notification importante"
        ev_name   = event.name if event else "AI EVENT OS"
        ev_dates  = (
            f"{event.start_date} – {event.end_date}" if event else ""
        )
        ev_venue  = event.venue or ""
        ev_city   = event.city or ""

        for r in recipients:
            if _has_celery:
                send_single_email.delay(
                    to_email=r["email"],
                    to_name=r["name"],
                    subject=subj,
                    template_name=template,
                    context={
                        "visitor_name": r["name"].split()[0],
                        "event_name":   ev_name,
                        "event_dates":  ev_dates,
                        "event_venue":  ev_venue,
                        "event_city":   ev_city,
                        "campaign_name": campaign.name,
                    },
                )
            else:
                print(f"[CAMPAIGN DEV] Would email {r['email']} — subject: {subj}")
    else:
        # WhatsApp / LinkedIn / SMS — log placeholder
        print(
            f"[CAMPAIGN] {campaign.channel.upper()} send: "
            f"{len(recipients)} recipients for '{campaign.name}'"
        )

    campaign.status = "sent"
    campaign.sent_count = len(recipients)
    await db.flush()
    await db.refresh(campaign)
    return campaign


async def schedule(
    db: AsyncSession,
    campaign_id: uuid.UUID,
    data: CampaignScheduleRequest,
) -> Campaign:
    campaign = await _get_or_404(db, campaign_id)
    if campaign.status not in ("draft",):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Only draft campaigns can be scheduled (current: '{campaign.status}')",
        )
    campaign.scheduled_at = data.scheduled_at
    campaign.status = "scheduled"
    await db.flush()
    await db.refresh(campaign)
    return campaign


# ── Stats ──────────────────────────────────────────────────────────────────────

async def get_stats(db: AsyncSession, campaign_id: uuid.UUID) -> dict:
    c = await _get_or_404(db, campaign_id)
    sent = c.sent_count or 0
    clicks = c.click_count or 0
    ctr = round(clicks / sent, 4) if sent > 0 else None
    return {
        "campaign_id":     c.id,
        "name":            c.name,
        "channel":         c.channel,
        "status":          c.status,
        "sent_count":      sent,
        "open_rate":       c.open_rate,
        "click_count":     clicks,
        "leads_generated": c.leads_generated or 0,
        "ctr":             ctr,
    }


async def get_event_stats(db: AsyncSession, event_id: uuid.UUID) -> dict:
    ev = await db.execute(select(Event).where(Event.id == event_id))
    if ev.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Event {event_id} not found")

    result = await db.execute(
        select(Campaign).where(Campaign.event_id == event_id)
    )
    campaigns = result.scalars().all()

    total_sent = sum(c.sent_count or 0 for c in campaigns)
    total_leads = sum(c.leads_generated or 0 for c in campaigns)
    open_rates = [c.open_rate for c in campaigns if c.open_rate is not None]
    avg_open = round(sum(open_rates) / len(open_rates), 4) if open_rates else None

    campaign_stats = []
    for c in campaigns:
        sent   = c.sent_count or 0
        clicks = c.click_count or 0
        campaign_stats.append({
            "campaign_id":     c.id,
            "name":            c.name,
            "channel":         c.channel,
            "status":          c.status,
            "sent_count":      sent,
            "open_rate":       c.open_rate,
            "click_count":     clicks,
            "leads_generated": c.leads_generated or 0,
            "ctr":             round(clicks / sent, 4) if sent > 0 else None,
        })

    return {
        "event_id":             event_id,
        "total_campaigns":      len(campaigns),
        "total_sent":           total_sent,
        "avg_open_rate":        avg_open,
        "total_leads_generated": total_leads,
        "campaigns":            campaign_stats,
    }
