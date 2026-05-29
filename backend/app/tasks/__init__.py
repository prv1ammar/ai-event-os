"""
app/tasks/__init__.py
──────────────────────
Celery application entry-point.

Start worker:  celery -A app.tasks worker --loglevel=info
Start beat:    celery -A app.tasks beat   --loglevel=info
Flower UI:     celery -A app.tasks flower --port=5555

Beat schedule (Africa/Casablanca timezone):
  J-15 reminder   — daily 09:00
  J-7  reminder   — daily 09:00
  J-3  reminder   — daily 09:00
  J-1  reminder   — daily 08:00
  post-event      — daily 10:00
  lead scoring    — every 2 hours
"""

from app.tasks.celery_app import celery_app  # noqa: F401 — re-exported for `celery -A app.tasks`

from celery.schedules import crontab

# ── Extend beat schedule with Phase-4 reminder tasks ──────────────────────────

celery_app.conf.beat_schedule.update(
    {
        "reminder-j15-daily": {
            "task": "app.tasks.email_tasks.send_j15_reminders",
            "schedule": crontab(hour=9, minute=0),
        },
        "reminder-j7-daily": {
            "task": "app.tasks.email_tasks.send_j7_reminders",
            "schedule": crontab(hour=9, minute=0),
        },
        "reminder-j3-daily": {
            "task": "app.tasks.email_tasks.send_j3_reminders",
            "schedule": crontab(hour=9, minute=0),
        },
        "reminder-j1-daily": {
            "task": "app.tasks.email_tasks.send_j1_reminders",
            "schedule": crontab(hour=8, minute=0),
        },
        "post-event-daily": {
            "task": "app.tasks.email_tasks.send_post_event",
            "schedule": crontab(hour=10, minute=0),
        },
        "update-lead-scores": {
            "task": "app.tasks.scoring_tasks.update_all_scores",
            "schedule": crontab(minute=0, hour="*/2"),
        },
    }
)

# Ensure task modules are registered with the worker
celery_app.conf.include = list(
    set(celery_app.conf.include or [])
    | {
        "app.tasks.email_tasks",
        "app.tasks.scoring_tasks",
        "app.tasks.whatsapp_tasks",
        "app.tasks.report_tasks",
        "app.tasks.analytics_tasks",
    }
)

__all__ = ["celery_app"]
