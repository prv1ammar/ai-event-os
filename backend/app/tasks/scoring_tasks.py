"""
app/tasks/scoring_tasks.py
───────────────────────────
Periodic lead-scoring task.

Runs every 2 hours via Celery Beat (see app/tasks/__init__.py).
For each lead in the database:
  1. Re-calculate score from interactions (sessions, scans, meetings, budget…)
  2. Auto-update status if not in a terminal state (closed_won / closed_lost)
"""
from __future__ import annotations

import asyncio
import logging

from app.tasks.celery_app import celery_app

log = logging.getLogger(__name__)


# ── Async implementation ───────────────────────────────────────────────────────

async def _async_update_all_scores() -> int:
    """
    Iterate every lead, recalculate score, persist changes.
    Returns the number of leads updated.
    """
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.lead import Lead
    from app.services.lead_service import calculate_lead_score, score_to_status

    updated = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Lead))
        leads = result.scalars().all()

        for lead in leads:
            try:
                new_score = await calculate_lead_score(db, lead.id)

                if lead.score != new_score:
                    lead.score = new_score
                    # Only auto-advance status for non-terminal leads
                    if lead.status not in ("closed_won", "closed_lost"):
                        lead.status = score_to_status(new_score)
                    updated += 1

            except Exception as exc:  # pragma: no cover
                log.error("[SCORING] Failed to score lead %s: %s", lead.id, exc)

        await db.commit()

    return updated


# ── Celery task ────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.scoring_tasks.update_all_scores")
def update_all_scores():
    """
    Celery Beat task — runs every 2 hours.
    Uses asyncio.run() to bridge the sync Celery worker into async SQLAlchemy.
    """
    updated = asyncio.run(_async_update_all_scores())
    log.info("[SCORING] Updated %d lead scores", updated)
    return {"updated": updated}


@celery_app.task(name="app.tasks.scoring_tasks.score_single_lead")
def score_single_lead(lead_id: str):
    """
    On-demand scoring for one lead.
    Called when a visitor action (scan, meeting, session) occurs.
    """
    async def _run():
        from sqlalchemy import select
        from app.core.database import AsyncSessionLocal
        from app.models.lead import Lead
        from app.services.lead_service import calculate_lead_score, score_to_status
        import uuid

        async with AsyncSessionLocal() as db:
            lid = uuid.UUID(lead_id)
            result = await db.execute(select(Lead).where(Lead.id == lid))
            lead = result.scalar_one_or_none()
            if lead is None:
                return {"error": "lead_not_found"}

            new_score = await calculate_lead_score(db, lid)
            lead.score = new_score
            if lead.status not in ("closed_won", "closed_lost"):
                lead.status = score_to_status(new_score)
            await db.commit()
            return {"lead_id": lead_id, "score": new_score, "status": lead.status}

    return asyncio.run(_run())
