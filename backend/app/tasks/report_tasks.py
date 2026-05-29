"""
app/tasks/report_tasks.py
─────────────────────────
Background report generation (PDF / Excel / PPT).
"""

from app.tasks.celery_app import celery_app


@celery_app.task
def generate_event_report(event_id: str, format: str = "pdf"):
    """Generate post-event report in requested format."""
    print(f"[REPORT] Generating {format.upper()} report for event {event_id}")


@celery_app.task
def generate_exhibitor_leads_export(exhibitor_id: str, event_id: str):
    """Export leads to Excel for an exhibitor."""
    print(f"[REPORT] Leads export for exhibitor {exhibitor_id}")
