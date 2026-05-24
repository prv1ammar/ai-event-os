"""
app/routers/ai.py
──────────────────
AI/ML endpoints: lead scoring, matchmaking, no-show prediction, insights.

All endpoints require authentication.
Organizer/Admin role required for bulk operations and event-level predictions.

Routes
──────
GET  /api/v1/ai/lead-score/{visitor_id}                  — score for visitor
POST /api/v1/ai/lead-score/bulk                          — bulk scoring for event
GET  /api/v1/ai/matchmaking/{visitor_id}                 — top exhibitors for visitor
GET  /api/v1/ai/matchmaking/{exhibitor_id}/visitors      — top visitors for exhibitor
GET  /api/v1/ai/predict/no-show/{event_id}               — no-show risk list
GET  /api/v1/ai/predict/visitor-risk/{visitor_id}        — individual risk score
GET  /api/v1/ai/insights/{event_id}                      — AI-generated summary
"""

from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.services import ai_scoring_service, matchmaking_service, prediction_service

router = APIRouter(prefix="/api/v1/ai", tags=["AI & Machine Learning"])


# ── POST /api/v1/ai/lead-score/bulk ──────────────────────────────────────────
# NOTE: Must be defined BEFORE /lead-score/{visitor_id} to avoid route conflict

@router.post(
    "/lead-score/bulk",
    summary="Bulk AI lead scoring for all leads in an event",
)
async def bulk_lead_score(
    event_id: UUID = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Scores every Lead record for the event and persists the result.
    Returns summary: leads_scored, average_score, method used.
    """
    return await ai_scoring_service.bulk_score_update(db, event_id)


# ── GET /api/v1/ai/lead-score/{visitor_id} ───────────────────────────────────

@router.get(
    "/lead-score/{visitor_id}",
    summary="Compute AI lead score (0–100) for a visitor",
)
async def get_lead_score(
    visitor_id: UUID,
    exhibitor_id: UUID | None = Query(
        None,
        description="Optionally persist the score on a specific lead",
    ),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Returns an AI score 0–100 with:
    - method: 'ml_model' | 'rule_based'
    - features: extracted feature vector
    - grade: A / B / C / D / F
    """
    return await ai_scoring_service.compute_lead_score(db, visitor_id, exhibitor_id)


# ── GET /api/v1/ai/matchmaking/{exhibitor_id}/visitors ───────────────────────
# NOTE: Must be before /matchmaking/{visitor_id} to avoid ambiguity

@router.get(
    "/matchmaking/{exhibitor_id}/visitors",
    summary="Top visitor matches for an exhibitor",
)
async def get_exhibitor_top_visitors(
    exhibitor_id: UUID,
    top_n: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Returns up to ``top_n`` visitors ranked by TF-IDF cosine similarity
    with the exhibitor's profile.
    """
    return await matchmaking_service.get_exhibitor_top_visitors(
        db, exhibitor_id, top_n
    )


# ── GET /api/v1/ai/matchmaking/{visitor_id} ───────────────────────────────────

@router.get(
    "/matchmaking/{visitor_id}",
    summary="Top exhibitor recommendations for a visitor",
)
async def get_visitor_matchmaking(
    visitor_id: UUID,
    top_n: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Uses TF-IDF cosine similarity to match the visitor's profile
    (role, company, attended sessions) against all exhibitor profiles.

    Returns top ``top_n`` exhibitors with match_score and reason.
    """
    return await matchmaking_service.get_visitor_recommendations(
        db, visitor_id, top_n
    )


# ── GET /api/v1/ai/predict/visitor-risk/{visitor_id} ─────────────────────────

@router.get(
    "/predict/visitor-risk/{visitor_id}",
    summary="No-show risk score for a single visitor",
)
async def get_visitor_risk(
    visitor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Returns risk_score, risk_level and breakdown of risk factors."""
    return await prediction_service.get_visitor_risk(db, visitor_id)


# ── GET /api/v1/ai/predict/no-show/{event_id} ────────────────────────────────

@router.get(
    "/predict/no-show/{event_id}",
    summary="Predicted no-show list for an event",
)
async def predict_no_shows(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Scores every registered visitor for no-show risk.

    Risk levels:
    - **high**   (score ≥ 50): send urgency reminder + phone call
    - **medium** (score 25–49): send automated reminder email
    - **low**    (score < 25): standard logistics email

    Returns aggregated counts + full visitor lists (capped at 50 per bucket).
    """
    return await prediction_service.predict_no_shows(db, event_id)


# ── GET /api/v1/ai/insights/{event_id} ───────────────────────────────────────

@router.get(
    "/insights/{event_id}",
    summary="AI-generated event insights summary",
)
async def get_ai_insights(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Synthesises KPIs, lead funnel, attendance, and session data into an
    actionable insights summary.

    Powered by rule-based analysis (and optionally OpenAI GPT when the
    OPENAI_API_KEY is configured).
    """
    from app.services.analytics_service import get_dashboard_kpis
    from app.services.prediction_service import predict_no_shows

    kpis = await get_dashboard_kpis(db, event_id)
    no_show = await predict_no_shows(db, event_id)

    # ── Rule-based insights ────────────────────────────────────────────────────
    insights: list[str] = []

    # Attendance
    occ = kpis.get("occupancy_rate", 0)
    if occ < 50:
        insights.append(
            f"Booth occupancy is low at {occ}%. Consider offering last-minute "
            f"discounts or upgrading smaller exhibitors to premium spaces."
        )
    elif occ > 85:
        insights.append(
            f"Booth occupancy is excellent at {occ}%. Prepare overflow capacity "
            f"for next edition."
        )

    # Leads
    total_leads = kpis.get("total_leads", 0)
    qualified = kpis.get("qualified_leads", 0)
    if total_leads > 0:
        conv = round(qualified / total_leads * 100, 1)
        if conv < 15:
            insights.append(
                f"Lead conversion to qualified is {conv}% — below the 15% benchmark. "
                f"Consider B2B meeting facilitation sessions."
            )
        else:
            insights.append(
                f"Strong lead conversion at {conv}% — above industry average."
            )

    # No-shows
    ns_rate = no_show.get("no_show_rate_pct", 0)
    high_risk = no_show.get("high_risk_count", 0)
    if ns_rate > 10:
        insights.append(
            f"Predicted no-show rate is {ns_rate}% with {high_risk} high-risk visitors. "
            f"Activate the J-1 reminder campaign immediately."
        )

    # ROI
    roi = kpis.get("roi_percent", 0)
    if roi > 100:
        insights.append(
            f"Estimated ROI of {roi}% — strong return. Document the formula for "
            f"future editions."
        )
    elif roi < 0:
        insights.append(
            f"Negative ROI ({roi}%) — review expense categories and revenue mix. "
            f"Increase sponsoring packages for next edition."
        )

    # Meetings
    meetings = kpis.get("meetings_scheduled", 0)
    visitors = kpis.get("total_visitors", 1)
    meeting_density = round(meetings / visitors * 100, 1) if visitors > 0 else 0
    if meeting_density < 5:
        insights.append(
            "Meeting density is low. Integrate an automated B2B matchmaking "
            "reminder 48 h before the event."
        )

    if not insights:
        insights.append("Event metrics are within normal ranges. No critical action required.")

    return {
        "event_id": str(event_id),
        "generated_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "kpi_summary": {
            "total_visitors": kpis.get("total_visitors"),
            "total_leads": total_leads,
            "qualified_leads": qualified,
            "occupancy_rate": occ,
            "roi_percent": roi,
            "predicted_no_show_rate_pct": ns_rate,
        },
        "insights": insights,
        "total_insights": len(insights),
        "action_priority": "high" if ns_rate > 10 or occ < 50 else "normal",
    }
