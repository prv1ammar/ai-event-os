"""
app/services/matchmaking_service.py
──────────────────────────────────────
AI-powered visitor ↔ exhibitor matchmaking using TF-IDF cosine similarity.

Algorithm
─────────
1. Build a text profile for the visitor:
   sector interest (from visitor role/company) + topics of sessions attended.
2. Build a text profile for each exhibitor:
   sector + description + package tier.
3. TF-IDF-vectorize all profiles together.
4. Compute cosine similarity between visitor vector and all exhibitor vectors.
5. Return top-N exhibitors sorted by match score (descending).

If there are fewer than 2 exhibitors (not enough for TF-IDF), the service
falls back to returning all exhibitors with a default score.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exhibitor import Exhibitor
from app.models.session import Session
from app.models.session_attendance import SessionAttendance
from app.models.visitor import Visitor


# ── Private helpers ────────────────────────────────────────────────────────────

async def _require_visitor(db: AsyncSession, visitor_id: uuid.UUID) -> Visitor:
    result = await db.execute(select(Visitor).where(Visitor.id == visitor_id))
    visitor = result.scalar_one_or_none()
    if visitor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visitor {visitor_id} not found",
        )
    return visitor


async def _require_exhibitor(
    db: AsyncSession, exhibitor_id: uuid.UUID
) -> Exhibitor:
    result = await db.execute(
        select(Exhibitor).where(Exhibitor.id == exhibitor_id)
    )
    exhibitor = result.scalar_one_or_none()
    if exhibitor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exhibitor {exhibitor_id} not found",
        )
    return exhibitor


def _build_visitor_text(visitor: Visitor, session_titles: list[str]) -> str:
    """Build a free-text profile for TF-IDF from visitor attributes."""
    parts = []
    if visitor.company:
        parts.append(visitor.company)
    if visitor.role:
        parts.append(visitor.role)
    if visitor.country:
        parts.append(visitor.country)
    parts.extend(session_titles)
    return " ".join(parts).strip() or "event participant"


def _build_exhibitor_text(exhibitor: Exhibitor) -> str:
    """Build a free-text profile for TF-IDF from exhibitor attributes."""
    parts = []
    if exhibitor.company_name:
        parts.append(exhibitor.company_name)
    if exhibitor.sector:
        parts.append(exhibitor.sector)
    if exhibitor.country:
        parts.append(exhibitor.country)
    if exhibitor.package:
        parts.append(exhibitor.package)
    return " ".join(parts).strip() or "exhibitor"


def _generate_reason(
    visitor: Visitor,
    exhibitor: Exhibitor,
    score: float,
) -> str:
    """Generate a human-readable match reason."""
    if exhibitor.sector and visitor.role:
        return (
            f"Your profile as {visitor.role} aligns with "
            f"{exhibitor.company_name}'s {exhibitor.sector} offerings."
        )
    if exhibitor.sector:
        return (
            f"{exhibitor.company_name} operates in {exhibitor.sector}, "
            f"matching your event interests."
        )
    return f"Strong profile compatibility with {exhibitor.company_name}."


# ── Main matchmaking function ─────────────────────────────────────────────────

async def get_visitor_recommendations(
    db: AsyncSession,
    visitor_id: uuid.UUID,
    top_n: int = 5,
) -> list[dict]:
    """
    Return the top-N best-matching exhibitors for a visitor.

    Uses TF-IDF cosine similarity on text profiles.
    Falls back to alphabetical ordering when fewer than 2 exhibitors exist.
    """
    visitor = await _require_visitor(db, visitor_id)

    # Sessions the visitor has attended → topic keywords
    attended_result = await db.execute(
        select(Session.title, Session.description)
        .join(SessionAttendance, SessionAttendance.session_id == Session.id)
        .where(SessionAttendance.visitor_id == visitor_id)
    )
    session_rows = attended_result.all()
    session_titles = [
        f"{r[0] or ''} {r[1] or ''}".strip() for r in session_rows
    ]

    # All exhibitors for the same event
    exhibitors_result = await db.execute(
        select(Exhibitor).where(
            Exhibitor.event_id == visitor.event_id,
            Exhibitor.status.in_(["validated", "pending"]),
        ).order_by(Exhibitor.company_name)
    )
    exhibitors = exhibitors_result.scalars().all()

    if not exhibitors:
        return []

    # ── TF-IDF cosine similarity ───────────────────────────────────────────────
    visitor_text = _build_visitor_text(visitor, session_titles)
    exhibitor_texts = [_build_exhibitor_text(ex) for ex in exhibitors]

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np

        all_texts = [visitor_text] + exhibitor_texts

        # Need at least 2 documents for TF-IDF to be meaningful
        if len(all_texts) < 2:
            raise ValueError("Not enough documents")

        vectorizer = TfidfVectorizer(
            stop_words="english",
            min_df=1,
            sublinear_tf=True,
        )
        tfidf_matrix = vectorizer.fit_transform(all_texts)

        # Visitor is index 0, exhibitors are indices 1..N
        similarities = cosine_similarity(
            tfidf_matrix[0:1], tfidf_matrix[1:]
        ).flatten()

        n = min(top_n, len(exhibitors))
        top_indices = similarities.argsort()[-n:][::-1]

    except Exception:
        # Fallback: return first top_n exhibitors with default score
        top_indices = list(range(min(top_n, len(exhibitors))))
        similarities = [0.5] * len(exhibitors)

    # ── Build response ─────────────────────────────────────────────────────────
    results = []
    for idx in top_indices:
        ex = exhibitors[idx]
        sim_score = float(similarities[idx]) if hasattr(similarities, '__getitem__') else 0.5

        results.append({
            "exhibitor_id": str(ex.id),
            "company": ex.company_name,
            "sector": ex.sector or "N/A",
            "country": ex.country,
            "package": ex.package,
            "match_score": round(sim_score, 3),
            "match_percent": round(sim_score * 100, 1),
            "reason": _generate_reason(visitor, ex, sim_score),
            "website": ex.website,
        })

    return results


# ── Top visitors for exhibitor ────────────────────────────────────────────────

async def get_exhibitor_top_visitors(
    db: AsyncSession,
    exhibitor_id: uuid.UUID,
    top_n: int = 10,
) -> list[dict]:
    """
    Return the top-N visitors most likely to be high-quality leads for
    the given exhibitor, ranked by reverse cosine similarity.
    """
    exhibitor = await _require_exhibitor(db, exhibitor_id)
    exhibitor_text = _build_exhibitor_text(exhibitor)

    # All visitors in the same event
    visitors_result = await db.execute(
        select(Visitor).where(Visitor.event_id == exhibitor.event_id)
        .limit(500)  # cap to avoid performance issues
    )
    visitors = visitors_result.scalars().all()

    if not visitors:
        return []

    # Build visitor texts
    visitor_texts = [_build_visitor_text(v, []) for v in visitors]

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        all_texts = [exhibitor_text] + visitor_texts
        if len(all_texts) < 2:
            raise ValueError("Not enough documents")

        vectorizer = TfidfVectorizer(stop_words="english", min_df=1)
        tfidf_matrix = vectorizer.fit_transform(all_texts)
        similarities = cosine_similarity(
            tfidf_matrix[0:1], tfidf_matrix[1:]
        ).flatten()

        n = min(top_n, len(visitors))
        top_indices = similarities.argsort()[-n:][::-1]

    except Exception:
        top_indices = list(range(min(top_n, len(visitors))))
        similarities = [0.5] * len(visitors)

    results = []
    for idx in top_indices:
        v = visitors[idx]
        sim_score = float(similarities[idx])
        results.append({
            "visitor_id": str(v.id),
            "name": f"{v.first_name} {v.last_name}",
            "email": v.email,
            "company": v.company,
            "role": v.role,
            "type": v.type,
            "country": v.country,
            "match_score": round(sim_score, 3),
            "match_percent": round(sim_score * 100, 1),
        })

    return results
