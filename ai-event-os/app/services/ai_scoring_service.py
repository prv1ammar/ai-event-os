"""
app/services/ai_scoring_service.py
────────────────────────────────────
AI-powered lead scoring for visitor–exhibitor pairs.

Scoring algorithm
─────────────────
If a trained GradientBoosting model exists at ``MODEL_PATH`` it is used.
Otherwise the service falls back to a deterministic rule-based scorer so
the API always returns a valid 0–100 integer.

Rule-based weights (max 100 pts)
─────────────────────────────────
sessions_attended    × 15 pts  → max 30
booths_visited       × 8 pts   → max 24
meetings_scheduled   × 20 pts  → max 20 (capped at 1 meeting)
budget_score         × 10 pts  → 0–3  → max 30
decision_maker       × 15 pts  → 0 or 15
profile_complete     × 0–20 pts

Total possible: 30 + 24 + 20 + 30 + 15 + 20 = 139 (capped at 100)
"""
from __future__ import annotations

import os
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exhibitor import Exhibitor
from app.models.lead import Lead, Meeting
from app.models.session_attendance import SessionAttendance
from app.models.ticket import QRScan
from app.models.visitor import Visitor

# ── ML model path ─────────────────────────────────────────────────────────────
MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "ml", "models", "lead_scoring_model.pkl"
)

# Job titles that qualify a visitor as a decision-maker
DECISION_MAKER_ROLES = {
    "ceo", "coo", "cto", "cfo", "director", "directeur", "directrice",
    "manager", "purchasing manager", "responsable achats", "pdg", "gérant",
    "daf", "drh", "vp", "vice president", "head of", "responsable",
}

# Budget range → score mapping (0–3)
BUDGET_SCORE_MAP = {
    None: 0,
    "":   0,
    "<50k":      1,
    "50k-100k":  2,
    "50-100k":   2,
    "100k-500k": 3,
    "500k+":     3,
    ">100k":     3,
    ">500k":     3,
}


# ── Private helpers ────────────────────────────────────────────────────────────

async def _require_visitor(db: AsyncSession, visitor_id: uuid.UUID) -> Visitor:
    result = await db.execute(
        select(Visitor).where(Visitor.id == visitor_id)
    )
    visitor = result.scalar_one_or_none()
    if visitor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visitor {visitor_id} not found",
        )
    return visitor


def _is_decision_maker(role: str | None) -> bool:
    if not role:
        return False
    role_lower = role.lower().strip()
    return any(kw in role_lower for kw in DECISION_MAKER_ROLES)


def _profile_complete_score(visitor: Visitor) -> float:
    """Return 0.0–1.0 based on how complete the visitor's profile is."""
    fields = [
        visitor.first_name,
        visitor.last_name,
        visitor.email,
        visitor.phone,
        visitor.company,
        visitor.role,
        visitor.country,
    ]
    filled = sum(1 for f in fields if f and str(f).strip())
    return filled / len(fields)


def _map_budget_score(budget_range: str | None) -> int:
    """Convert budget_range string to 0–3 integer score."""
    if budget_range is None:
        return 0
    key = budget_range.strip()
    # Exact match
    if key in BUDGET_SCORE_MAP:
        return BUDGET_SCORE_MAP[key]
    # Heuristic: look for keywords
    low = key.lower()
    if "500" in low or "million" in low:
        return 3
    if "100" in low:
        return 3
    if "50" in low:
        return 2
    return 1  # Has some budget declared


# ── Feature extraction ─────────────────────────────────────────────────────────

async def extract_visitor_features(
    db: AsyncSession, visitor_id: uuid.UUID
) -> dict[str, Any]:
    """Extract scoring features for a single visitor."""
    visitor = await _require_visitor(db, visitor_id)

    # Sessions attended
    sessions_attended = (await db.execute(
        select(func.count(SessionAttendance.id)).where(
            SessionAttendance.visitor_id == visitor_id
        )
    )).scalar() or 0

    # Booths visited (unique booth scans)
    booths_visited = (await db.execute(
        select(func.count(func.distinct(QRScan.zone))).where(
            QRScan.visitor_id == visitor_id,
            QRScan.scan_type == "booth",
        )
    )).scalar() or 0

    # Meetings scheduled
    meetings_scheduled = (await db.execute(
        select(func.count(Meeting.id)).where(
            Meeting.visitor_id == visitor_id
        )
    )).scalar() or 0

    # Lead budget score (from highest lead found for visitor)
    lead_result = await db.execute(
        select(Lead.budget_range).where(
            Lead.visitor_id == visitor_id
        ).limit(1)
    )
    budget_range = lead_result.scalar_one_or_none()
    budget_score = _map_budget_score(budget_range)

    return {
        "visitor_id": str(visitor_id),
        "profile_complete_score": _profile_complete_score(visitor),
        "sessions_attended": sessions_attended,
        "booths_visited": booths_visited,
        "meetings_scheduled": meetings_scheduled,
        "budget_score": budget_score,
        "decision_maker": 1 if _is_decision_maker(visitor.role) else 0,
        "visitor_type": visitor.type or "standard",
    }


# ── Rule-based scorer (fallback) ───────────────────────────────────────────────

def compute_rule_based_score(features: dict[str, Any]) -> int:
    """
    Deterministic rule-based lead score (0–100).

    Rule               Points
    ─────────────────────────────
    sessions_attended  × 15  (cap 30)
    booths_visited     × 8   (cap 24)
    meetings_scheduled × 20  (cap 20)
    budget_score (0-3) × 10  (cap 30)
    decision_maker     × 15
    profile_complete   × 20
    """
    score = 0
    score += min(features.get("sessions_attended", 0) * 15, 30)
    score += min(features.get("booths_visited", 0) * 8, 24)
    score += min(features.get("meetings_scheduled", 0) * 20, 20)
    score += features.get("budget_score", 0) * 10
    score += features.get("decision_maker", 0) * 15
    score += int(features.get("profile_complete_score", 0) * 20)

    # VIP bonus
    if features.get("visitor_type") == "vip":
        score += 5

    return min(max(score, 0), 100)


# ── ML scorer ─────────────────────────────────────────────────────────────────

def _try_ml_score(features: dict[str, Any]) -> int | None:
    """Load the pickled ML model and return a score. Returns None on failure."""
    try:
        import joblib
        model = joblib.load(MODEL_PATH)
        feature_vector = [
            features["profile_complete_score"],
            features["sessions_attended"],
            features["booths_visited"],
            features["meetings_scheduled"],
            features["budget_score"],
            features["decision_maker"],
        ]
        proba = model.predict_proba([feature_vector])[0][1]
        return int(min(max(proba * 100, 0), 100))
    except Exception:
        return None


# ── Public API ─────────────────────────────────────────────────────────────────

async def compute_lead_score(
    db: AsyncSession,
    visitor_id: uuid.UUID,
    exhibitor_id: uuid.UUID | None = None,
) -> dict:
    """
    Compute an AI lead score (0–100) for a visitor.

    Uses the ML model when available, falls back to rule-based scoring.
    Persists the score on the highest-priority lead for this visitor if
    ``exhibitor_id`` is provided.
    """
    features = await extract_visitor_features(db, visitor_id)

    # Try ML model first, fallback to rules
    score = _try_ml_score(features)
    if score is None:
        score = compute_rule_based_score(features)
        method = "rule_based"
    else:
        method = "ml_model"

    # Persist score to Lead record if exhibitor is specified
    if exhibitor_id is not None:
        lead_result = await db.execute(
            select(Lead).where(
                Lead.visitor_id == visitor_id,
                Lead.exhibitor_id == exhibitor_id,
            ).limit(1)
        )
        lead = lead_result.scalar_one_or_none()
        if lead:
            lead.score = score
            await db.flush()

    return {
        "visitor_id": str(visitor_id),
        "exhibitor_id": str(exhibitor_id) if exhibitor_id else None,
        "score": score,
        "method": method,
        "features": features,
        "grade": _score_to_grade(score),
    }


async def bulk_score_update(
    db: AsyncSession, event_id: uuid.UUID
) -> dict:
    """
    Compute and persist AI scores for ALL leads of an event.

    Returns a summary dict with counts and average score.
    """
    # Load all leads for this event
    leads_result = await db.execute(
        select(Lead).where(Lead.event_id == event_id)
    )
    leads = leads_result.scalars().all()

    updated = 0
    total_score = 0

    for lead in leads:
        try:
            features = await extract_visitor_features(db, lead.visitor_id)
            score = _try_ml_score(features) or compute_rule_based_score(features)
            lead.score = score
            total_score += score
            updated += 1
        except Exception:
            continue

    await db.flush()

    return {
        "event_id": str(event_id),
        "leads_scored": updated,
        "average_score": round(total_score / updated, 1) if updated > 0 else 0.0,
        "method": "ml_model" if os.path.exists(MODEL_PATH) else "rule_based",
    }


def _score_to_grade(score: int) -> str:
    """Convert numeric score to letter grade for display."""
    if score >= 80:
        return "A"
    elif score >= 60:
        return "B"
    elif score >= 40:
        return "C"
    elif score >= 20:
        return "D"
    return "F"
