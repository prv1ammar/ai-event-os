"""
app/tasks/analytics_tasks.py
─────────────────────────────
Scheduled analytics computation tasks.
"""

from app.tasks.celery_app import celery_app


@celery_app.task
def refresh_daily_stats():
    """Recompute and cache daily event statistics."""
    print("[ANALYTICS] Refreshing daily stats…")


@celery_app.task
def score_leads():
    """Run AI lead scoring model on all unscored leads."""
    print("[ANALYTICS] Running lead scoring…")
