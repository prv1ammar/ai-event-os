"""
app/tasks/email_tasks.py
─────────────────────────
Celery email tasks using SendGrid + Jinja2 HTML templates.

Reminder tasks run daily via Celery Beat (see app/tasks/__init__.py):
  send_j15_reminders  — 09:00, fires when event is exactly 15 days away
  send_j7_reminders   — 09:00, fires when event is exactly  7 days away
  send_j3_reminders   — 09:00, fires when event is exactly  3 days away
  send_j1_reminders   — 08:00, fires when event is exactly  1 day  away
  send_post_event     — 10:00, fires the day AFTER event end

send_single_email() is the low-level primitive used by all others and
by campaign_service.send_now().
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.tasks.celery_app import celery_app
from app.core.config import settings

log = logging.getLogger(__name__)

# ── Jinja2 environment ────────────────────────────────────────────────────────

TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "emails"
jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)


# ── Low-level send primitive ──────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.tasks.email_tasks.send_single_email",
    max_retries=3,
    default_retry_delay=60,
)
def send_single_email(
    self,
    to_email: str,
    to_name: str,
    subject: str,
    template_name: str,
    context: dict,
):
    """
    Render a Jinja2 template and send via SendGrid.
    Retries up to 3 times on transient failures (rate-limit / network).
    """
    try:
        template = jinja_env.get_template(template_name)
        html_content = template.render(**context)

        if not settings.SENDGRID_API_KEY:
            log.warning("[EMAIL] SENDGRID_API_KEY not set — skipping actual send.")
            log.info("[EMAIL DEV] To: %s | Subject: %s", to_email, subject)
            return {"status": "skipped", "reason": "no_api_key"}

        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        message = Mail(
            from_email=("events@aieventos.ma", "AI EVENT OS"),
            to_emails=(to_email, to_name),
            subject=subject,
            html_content=html_content,
        )
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        log.info("[EMAIL] Sent to %s — status %s", to_email, response.status_code)
        return {"status": "sent", "to": to_email, "http_status": response.status_code}

    except Exception as exc:
        log.error("[EMAIL] Failed to send to %s: %s", to_email, exc)
        raise self.retry(exc=exc)


# ── Async DB helper (called inside asyncio.run) ───────────────────────────────

async def _get_event_recipients(days_before: int) -> list[dict]:
    """
    Find events whose start_date == today + days_before and return
    a list of confirmed visitor dicts for those events.
    """
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.event import Event
    from app.models.visitor import Visitor
    from app.models.ticket import Ticket

    target_date = date.today() + timedelta(days=days_before)

    async with AsyncSessionLocal() as db:
        events_q = await db.execute(
            select(Event).where(Event.start_date == target_date)
        )
        events = events_q.scalars().all()

        recipients: list[dict] = []
        for event in events:
            visitors_q = await db.execute(
                select(Visitor)
                .join(Ticket, Ticket.visitor_id == Visitor.id)
                .where(
                    Visitor.event_id == event.id,
                    Ticket.status == "confirmed",
                )
            )
            for v in visitors_q.scalars().all():
                recipients.append(
                    {
                        "email":       v.email,
                        "name":        f"{v.first_name} {v.last_name}",
                        "first_name":  v.first_name,
                        "event_name":  event.name,
                        "event_dates": f"{event.start_date} – {event.end_date}",
                        "event_venue": event.venue or "",
                        "event_city":  event.city or "",
                        "days_until":  days_before,
                    }
                )
    return recipients


async def _get_post_event_recipients() -> list[dict]:
    """
    Find events whose end_date == yesterday and return confirmed visitors.
    """
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.event import Event
    from app.models.visitor import Visitor
    from app.models.ticket import Ticket

    yesterday = date.today() - timedelta(days=1)

    async with AsyncSessionLocal() as db:
        events_q = await db.execute(
            select(Event).where(Event.end_date == yesterday)
        )
        events = events_q.scalars().all()

        recipients: list[dict] = []
        for event in events:
            visitors_q = await db.execute(
                select(Visitor)
                .join(Ticket, Ticket.visitor_id == Visitor.id)
                .where(
                    Visitor.event_id == event.id,
                    Ticket.status == "confirmed",
                )
            )
            for v in visitors_q.scalars().all():
                recipients.append(
                    {
                        "email":      v.email,
                        "name":       f"{v.first_name} {v.last_name}",
                        "first_name": v.first_name,
                        "event_name": event.name,
                        "event_dates": f"{event.start_date} – {event.end_date}",
                        "event_venue": event.venue or "",
                        "event_city":  event.city or "",
                    }
                )
    return recipients


def _dispatch_reminders(
    recipients: list[dict],
    template_name: str,
    subject_builder,
) -> int:
    """Send individual email tasks for each recipient. Returns count dispatched."""
    count = 0
    for r in recipients:
        send_single_email.delay(
            to_email=r["email"],
            to_name=r["name"],
            subject=subject_builder(r),
            template_name=template_name,
            context={
                "visitor_name": r["first_name"],
                "event_name":   r["event_name"],
                "event_dates":  r["event_dates"],
                "event_venue":  r["event_venue"],
                "event_city":   r["event_city"],
                "days_until":   r.get("days_until", 0),
            },
        )
        count += 1
    return count


# ── J-15 reminder ─────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.email_tasks.send_j15_reminders")
def send_j15_reminders():
    """Daily 09:00 — events starting in 15 days."""
    recipients = asyncio.run(_get_event_recipients(15))
    count = _dispatch_reminders(
        recipients,
        template_name="reminder_j15.html",
        subject_builder=lambda r: f"[J-15] {r['event_name']} — Votre événement approche !",
    )
    log.info("[BEAT] J-15 reminders dispatched: %d", count)
    return {"dispatched": count}


# ── J-7 reminder ──────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.email_tasks.send_j7_reminders")
def send_j7_reminders():
    """Daily 09:00 — events starting in 7 days."""
    recipients = asyncio.run(_get_event_recipients(7))
    count = _dispatch_reminders(
        recipients,
        template_name="reminder_j7.html",
        subject_builder=lambda r: f"[J-7] {r['event_name']} — Plus qu'une semaine !",
    )
    log.info("[BEAT] J-7 reminders dispatched: %d", count)
    return {"dispatched": count}


# ── J-3 reminder ──────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.email_tasks.send_j3_reminders")
def send_j3_reminders():
    """Daily 09:00 — events starting in 3 days."""
    recipients = asyncio.run(_get_event_recipients(3))
    count = _dispatch_reminders(
        recipients,
        template_name="reminder_j3.html",
        subject_builder=lambda r: f"[J-3] {r['event_name']} — Dans 3 jours !",
    )
    log.info("[BEAT] J-3 reminders dispatched: %d", count)
    return {"dispatched": count}


# ── J-1 reminder ──────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.email_tasks.send_j1_reminders")
def send_j1_reminders():
    """Daily 08:00 — events starting tomorrow."""
    recipients = asyncio.run(_get_event_recipients(1))
    count = _dispatch_reminders(
        recipients,
        template_name="reminder_j1.html",
        subject_builder=lambda r: f"[DEMAIN] {r['event_name']} — Êtes-vous prêt ?",
    )
    log.info("[BEAT] J-1 reminders dispatched: %d", count)
    return {"dispatched": count}


# ── Post-event ────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.email_tasks.send_post_event")
def send_post_event():
    """Daily 10:00 — day after event ends."""
    recipients = asyncio.run(_get_post_event_recipients())
    count = _dispatch_reminders(
        recipients,
        template_name="post_event.html",
        subject_builder=lambda r: f"Merci d'avoir participé à {r['event_name']} !",
    )
    log.info("[BEAT] Post-event emails dispatched: %d", count)
    return {"dispatched": count}


# ── Ticket confirmation (used by visitors-qr-agent) ───────────────────────────

@celery_app.task(
    bind=True,
    name="app.tasks.email_tasks.send_ticket_confirmation",
    max_retries=3,
    default_retry_delay=60,
)
def send_ticket_confirmation(
    self,
    visitor_email: str,
    visitor_name: str,
    ticket_code: str,
    event_name: str,
    event_dates: str,
    event_venue: str,
    event_city: str,
):
    """Send booking confirmation with ticket code to the visitor."""
    send_single_email.delay(
        to_email=visitor_email,
        to_name=visitor_name,
        subject=f"Votre billet pour {event_name} — {ticket_code}",
        template_name="confirmation.html",
        context={
            "visitor_name": visitor_name.split()[0],
            "ticket_code":  ticket_code,
            "event_name":   event_name,
            "event_dates":  event_dates,
            "event_venue":  event_venue,
            "event_city":   event_city,
        },
    )


# ── Exhibitor welcome ─────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.email_tasks.send_exhibitor_welcome")
def send_exhibitor_welcome(
    exhibitor_email: str,
    company_name: str,
    contact_name: str,
    event_name: str,
    event_dates: str,
    event_venue: str,
    event_city: str,
):
    """Welcome email for newly validated exhibitors."""
    send_single_email.delay(
        to_email=exhibitor_email,
        to_name=contact_name,
        subject=f"Bienvenue à {event_name} — Votre dossier est validé !",
        template_name="confirmation.html",
        context={
            "visitor_name": contact_name.split()[0],
            "ticket_code":  "EXHIBITOR",
            "event_name":   event_name,
            "event_dates":  event_dates,
            "event_venue":  event_venue,
            "event_city":   event_city,
        },
    )
