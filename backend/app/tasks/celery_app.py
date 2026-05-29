"""
app/tasks/celery_app.py
───────────────────────
Celery application instance.
Import this module in every task file with: from app.tasks.celery_app import celery_app
"""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "ai_event_os",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.email_tasks",
        "app.tasks.report_tasks",
        "app.tasks.analytics_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Africa/Casablanca",
    enable_utc=True,
    task_track_started=True,
    result_expires=3600,          # results expire after 1 hour
    worker_prefetch_multiplier=1,
)

# ── Periodic tasks (celery beat) ───────────────────────────────────────────────
celery_app.conf.beat_schedule = {
    "daily-analytics-refresh": {
        "task": "app.tasks.analytics_tasks.refresh_daily_stats",
        "schedule": crontab(hour=2, minute=0),   # 02:00 Casablanca time
    },
    "hourly-lead-scoring": {
        "task": "app.tasks.analytics_tasks.score_leads",
        "schedule": crontab(minute=0),            # every hour
    },
}
