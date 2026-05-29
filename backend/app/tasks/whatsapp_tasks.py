"""
app/tasks/whatsapp_tasks.py
────────────────────────────
WhatsApp notification tasks (placeholder).

Requires: WhatsApp Business API credentials (Meta / Twilio / Infobip).
Set WHATSAPP_API_KEY and WHATSAPP_PHONE_NUMBER_ID in .env when ready.

Until credentials are configured, tasks log a structured message and
return {"status": "skipped", "reason": "no_credentials"}.
"""
from __future__ import annotations

import logging

from app.tasks.celery_app import celery_app

log = logging.getLogger(__name__)


def _whatsapp_configured() -> bool:
    """Return True when WhatsApp credentials are present."""
    from app.core.config import settings
    return bool(getattr(settings, "WHATSAPP_API_KEY", None))


@celery_app.task(
    bind=True,
    name="app.tasks.whatsapp_tasks.send_whatsapp_message",
    max_retries=3,
    default_retry_delay=120,
)
def send_whatsapp_message(
    self,
    to_phone: str,
    template_name: str,
    parameters: list[str],
):
    """
    Send a WhatsApp template message.

    Args:
        to_phone:      E.164 format, e.g. "+212612345678"
        template_name: Approved WhatsApp template name
        parameters:    Positional template variable values
    """
    if not _whatsapp_configured():
        log.info(
            "[WHATSAPP] Skipped — no credentials. To: %s | Template: %s",
            to_phone, template_name,
        )
        return {"status": "skipped", "reason": "no_credentials", "to": to_phone}

    try:
        # ── Twilio integration example ─────────────────────────────────────────
        # from twilio.rest import Client
        # from app.core.config import settings
        # client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        # message = client.messages.create(
        #     from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
        #     to=f"whatsapp:{to_phone}",
        #     body="\n".join(parameters),
        # )
        # return {"status": "sent", "sid": message.sid}

        log.info("[WHATSAPP] Would send to %s template=%s", to_phone, template_name)
        return {"status": "placeholder", "to": to_phone}

    except Exception as exc:
        log.error("[WHATSAPP] Failed: %s", exc)
        raise self.retry(exc=exc)


@celery_app.task(name="app.tasks.whatsapp_tasks.send_event_reminder_whatsapp")
def send_event_reminder_whatsapp(
    to_phone: str,
    visitor_name: str,
    event_name: str,
    days_until: int,
):
    """
    Send an event reminder via WhatsApp.
    Delegates to the generic send_whatsapp_message task.
    """
    send_whatsapp_message.delay(
        to_phone=to_phone,
        template_name="event_reminder",
        parameters=[visitor_name, event_name, str(days_until)],
    )
