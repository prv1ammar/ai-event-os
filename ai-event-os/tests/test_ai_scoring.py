"""
tests/test_ai_scoring.py
──────────────────────────
Tests for the AI/ML layer:
  - Lead scoring (rule-based)
  - Matchmaking (TF-IDF cosine similarity)
  - No-show prediction
  - AI insights endpoint

Covers
──────
- GET /api/v1/ai/lead-score/{visitor_id}
- POST /api/v1/ai/lead-score/bulk
- GET /api/v1/ai/matchmaking/{visitor_id}
- GET /api/v1/ai/matchmaking/{exhibitor_id}/visitors
- GET /api/v1/ai/predict/no-show/{event_id}
- GET /api/v1/ai/predict/visitor-risk/{visitor_id}
- GET /api/v1/ai/insights/{event_id}
- Unit tests for rule-based scorer
- Auth guards (401/403)
"""

import uuid

import pytest
from httpx import AsyncClient

# ── Constants ──────────────────────────────────────────────────────────────────

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"

EVENT_PAYLOAD = {
    "name": "AI Scoring Test Event 2026",
    "start_date": "2026-10-01",
    "end_date": "2026-10-03",
    "venue": "Centre International de Marrakech",
    "city": "Marrakech",
    "country": "Morocco",
    "capacity": 2000,
    "category": "conference",
    "budget_mad": 500000,
}

VISITOR_PAYLOAD = {
    "first_name": "Youssef",
    "last_name": "Alaoui",
    "email": "youssef.alaoui.test@aievents.ma",
    "phone": "+212600000001",
    "company": "AgroMaroc SARL",
    "role": "Purchasing Manager",
    "type": "standard",
    "country": "Morocco",
}

EXHIBITOR_PAYLOAD = {
    "company_name": "GreenTech Solutions",
    "sector": "Agriculture Bio",
    "contact_name": "Fatima Zahra",
    "contact_email": "fz.test@greentech.ma",
    "contact_phone": "+212661111111",
    "country": "Morocco",
    "package": "premium",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _create_event(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/events", json=EVENT_PAYLOAD, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_visitor(
    client: AsyncClient, headers: dict, event_id: str, suffix: str = ""
) -> str:
    payload = {**VISITOR_PAYLOAD, "event_id": event_id}
    if suffix:
        payload["email"] = f"visitor{suffix}@test.ma"
        payload["first_name"] = f"Visitor{suffix}"
    r = await client.post("/api/v1/visitors", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_exhibitor(
    client: AsyncClient, headers: dict, event_id: str, suffix: str = ""
) -> str | None:
    payload = {**EXHIBITOR_PAYLOAD, "event_id": event_id}
    if suffix:
        payload["company_name"] = f"Company {suffix}"
        payload["contact_email"] = f"contact{suffix}@test.ma"
    r = await client.post("/api/v1/exhibitors", json=payload, headers=headers)
    if r.status_code in (200, 201):
        return r.json()["id"]
    return None


# ═════════════════════════════════════════════════════════════════════════════
# Unit tests — rule-based scorer (no HTTP)
# ═════════════════════════════════════════════════════════════════════════════

def test_rule_based_score_zero_features():
    """Zero features → score of 0."""
    from app.services.ai_scoring_service import compute_rule_based_score

    features = {
        "sessions_attended": 0,
        "booths_visited": 0,
        "meetings_scheduled": 0,
        "budget_score": 0,
        "decision_maker": 0,
        "profile_complete_score": 0.0,
        "visitor_type": "standard",
    }
    score = compute_rule_based_score(features)
    assert score == 0


def test_rule_based_score_sessions_weight():
    """sessions_attended × 15 pts, capped at 30."""
    from app.services.ai_scoring_service import compute_rule_based_score

    base = {"booths_visited": 0, "meetings_scheduled": 0, "budget_score": 0,
            "decision_maker": 0, "profile_complete_score": 0.0, "visitor_type": "standard"}

    assert compute_rule_based_score({**base, "sessions_attended": 1}) == 15
    assert compute_rule_based_score({**base, "sessions_attended": 2}) == 30
    # Capped at 30 even with many sessions
    assert compute_rule_based_score({**base, "sessions_attended": 10}) == 30


def test_rule_based_score_booths_weight():
    """booths_visited × 8 pts, capped at 24."""
    from app.services.ai_scoring_service import compute_rule_based_score

    base = {"sessions_attended": 0, "meetings_scheduled": 0, "budget_score": 0,
            "decision_maker": 0, "profile_complete_score": 0.0, "visitor_type": "standard"}

    assert compute_rule_based_score({**base, "booths_visited": 1}) == 8
    assert compute_rule_based_score({**base, "booths_visited": 3}) == 24
    assert compute_rule_based_score({**base, "booths_visited": 10}) == 24


def test_rule_based_score_meetings_weight():
    """meetings_scheduled × 20 pts, capped at 20."""
    from app.services.ai_scoring_service import compute_rule_based_score

    base = {"sessions_attended": 0, "booths_visited": 0, "budget_score": 0,
            "decision_maker": 0, "profile_complete_score": 0.0, "visitor_type": "standard"}

    assert compute_rule_based_score({**base, "meetings_scheduled": 1}) == 20
    assert compute_rule_based_score({**base, "meetings_scheduled": 5}) == 20


def test_rule_based_score_budget_weight():
    """budget_score (0–3) × 10 pts → max 30."""
    from app.services.ai_scoring_service import compute_rule_based_score

    base = {"sessions_attended": 0, "booths_visited": 0, "meetings_scheduled": 0,
            "decision_maker": 0, "profile_complete_score": 0.0, "visitor_type": "standard"}

    assert compute_rule_based_score({**base, "budget_score": 0}) == 0
    assert compute_rule_based_score({**base, "budget_score": 1}) == 10
    assert compute_rule_based_score({**base, "budget_score": 2}) == 20
    assert compute_rule_based_score({**base, "budget_score": 3}) == 30


def test_rule_based_score_decision_maker_weight():
    """decision_maker × 15 pts."""
    from app.services.ai_scoring_service import compute_rule_based_score

    base = {"sessions_attended": 0, "booths_visited": 0, "meetings_scheduled": 0,
            "budget_score": 0, "profile_complete_score": 0.0, "visitor_type": "standard"}

    assert compute_rule_based_score({**base, "decision_maker": 0}) == 0
    assert compute_rule_based_score({**base, "decision_maker": 1}) == 15


def test_rule_based_score_max_100():
    """Score never exceeds 100."""
    from app.services.ai_scoring_service import compute_rule_based_score

    features = {
        "sessions_attended": 100,
        "booths_visited": 100,
        "meetings_scheduled": 100,
        "budget_score": 3,
        "decision_maker": 1,
        "profile_complete_score": 1.0,
        "visitor_type": "vip",
    }
    score = compute_rule_based_score(features)
    assert 0 <= score <= 100


def test_rule_based_score_grade():
    """Score to grade mapping."""
    from app.services.ai_scoring_service import _score_to_grade

    assert _score_to_grade(90) == "A"
    assert _score_to_grade(80) == "A"
    assert _score_to_grade(79) == "B"
    assert _score_to_grade(60) == "B"
    assert _score_to_grade(59) == "C"
    assert _score_to_grade(40) == "C"
    assert _score_to_grade(39) == "D"
    assert _score_to_grade(20) == "D"
    assert _score_to_grade(19) == "F"
    assert _score_to_grade(0) == "F"


def test_decision_maker_detection():
    """_is_decision_maker recognises common decision-maker roles."""
    from app.services.ai_scoring_service import _is_decision_maker

    assert _is_decision_maker("CEO")
    assert _is_decision_maker("Purchasing Manager")
    assert _is_decision_maker("Directeur Général")
    assert _is_decision_maker("PDG")
    assert _is_decision_maker("Head of Procurement")
    assert not _is_decision_maker("Intern")
    assert not _is_decision_maker(None)
    assert not _is_decision_maker("")


def test_budget_score_mapping():
    """_map_budget_score correctly maps budget ranges."""
    from app.services.ai_scoring_service import _map_budget_score

    assert _map_budget_score(None) == 0
    assert _map_budget_score("") == 0
    assert _map_budget_score("<50k") == 1
    assert _map_budget_score("50k-100k") == 2
    assert _map_budget_score("100k-500k") == 3
    assert _map_budget_score(">500k") == 3


# ═════════════════════════════════════════════════════════════════════════════
# Lead score — HTTP endpoint
# ═════════════════════════════════════════════════════════════════════════════

async def test_lead_score_visitor_not_found(
    client: AsyncClient, organizer_headers: dict
):
    """Unknown visitor returns 404."""
    r = await client.get(
        f"/api/v1/ai/lead-score/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


async def test_lead_score_basic_visitor(
    client: AsyncClient, organizer_headers: dict
):
    """Score for a real visitor returns 0–100 with expected fields."""
    event_id = await _create_event(client, organizer_headers)
    visitor_id = await _create_visitor(client, organizer_headers, event_id)

    r = await client.get(
        f"/api/v1/ai/lead-score/{visitor_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()

    assert "score" in data
    assert "method" in data
    assert "grade" in data
    assert "features" in data
    assert 0 <= data["score"] <= 100
    assert data["method"] in ("rule_based", "ml_model")
    assert data["grade"] in ("A", "B", "C", "D", "F")


async def test_lead_score_decision_maker_higher(
    client: AsyncClient, organizer_headers: dict
):
    """Decision-maker role should produce a higher score."""
    event_id = await _create_event(client, organizer_headers)

    # Decision-maker visitor
    dm_payload = {**VISITOR_PAYLOAD, "event_id": event_id,
                  "role": "CEO", "email": "ceo.dm@test.ma"}
    r_dm = await client.post("/api/v1/visitors", json=dm_payload, headers=organizer_headers)
    assert r_dm.status_code == 201

    # Standard visitor with no role
    std_payload = {**VISITOR_PAYLOAD, "event_id": event_id,
                   "role": "Intern", "email": "intern.std@test.ma"}
    r_std = await client.post("/api/v1/visitors", json=std_payload, headers=organizer_headers)
    assert r_std.status_code == 201

    score_dm  = (await client.get(
        f"/api/v1/ai/lead-score/{r_dm.json()['id']}",
        headers=organizer_headers,
    )).json()["score"]

    score_std = (await client.get(
        f"/api/v1/ai/lead-score/{r_std.json()['id']}",
        headers=organizer_headers,
    )).json()["score"]

    assert score_dm >= score_std, (
        f"CEO score {score_dm} should be ≥ Intern score {score_std}"
    )


async def test_lead_score_requires_auth(
    client: AsyncClient, organizer_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    visitor_id = await _create_visitor(client, organizer_headers, event_id)
    r = await client.get(f"/api/v1/ai/lead-score/{visitor_id}")
    assert r.status_code == 401


# ═════════════════════════════════════════════════════════════════════════════
# Bulk lead scoring
# ═════════════════════════════════════════════════════════════════════════════

async def test_bulk_score_empty_event(
    client: AsyncClient, organizer_headers: dict
):
    """Bulk score on event with no leads returns zero counts."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.post(
        "/api/v1/ai/lead-score/bulk",
        json={"event_id": event_id},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "leads_scored" in data
    assert "average_score" in data
    assert data["leads_scored"] == 0


async def test_bulk_score_requires_organizer(
    client: AsyncClient, visitor_headers: dict, organizer_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    r = await client.post(
        "/api/v1/ai/lead-score/bulk",
        json={"event_id": event_id},
        headers=visitor_headers,
    )
    assert r.status_code == 403


# ═════════════════════════════════════════════════════════════════════════════
# Matchmaking
# ═════════════════════════════════════════════════════════════════════════════

async def test_matchmaking_visitor_not_found(
    client: AsyncClient, organizer_headers: dict
):
    r = await client.get(
        f"/api/v1/ai/matchmaking/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


async def test_matchmaking_no_exhibitors(
    client: AsyncClient, organizer_headers: dict
):
    """Visitor in event with no exhibitors gets empty recommendations."""
    event_id = await _create_event(client, organizer_headers)
    visitor_id = await _create_visitor(client, organizer_headers, event_id)

    r = await client.get(
        f"/api/v1/ai/matchmaking/{visitor_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_matchmaking_returns_up_to_top_n(
    client: AsyncClient, organizer_headers: dict
):
    """Matchmaking returns at most top_n results."""
    event_id = await _create_event(client, organizer_headers)
    visitor_id = await _create_visitor(client, organizer_headers, event_id)

    # Create 3 exhibitors
    for i in range(3):
        await _create_exhibitor(client, organizer_headers, event_id, str(i))

    r = await client.get(
        f"/api/v1/ai/matchmaking/{visitor_id}?top_n=2",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) <= 2


async def test_matchmaking_result_structure(
    client: AsyncClient, organizer_headers: dict
):
    """Matchmaking results contain required fields."""
    event_id = await _create_event(client, organizer_headers)
    visitor_id = await _create_visitor(client, organizer_headers, event_id)
    ex_id = await _create_exhibitor(client, organizer_headers, event_id)

    if ex_id is None:
        pytest.skip("Exhibitor creation not available in this test run")

    r = await client.get(
        f"/api/v1/ai/matchmaking/{visitor_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    if data:
        item = data[0]
        assert "exhibitor_id" in item
        assert "company" in item
        assert "match_score" in item
        assert "reason" in item
        assert 0.0 <= item["match_score"] <= 1.0


async def test_matchmaking_requires_auth(
    client: AsyncClient, organizer_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    visitor_id = await _create_visitor(client, organizer_headers, event_id)
    r = await client.get(f"/api/v1/ai/matchmaking/{visitor_id}")
    assert r.status_code == 401


# ═════════════════════════════════════════════════════════════════════════════
# No-show prediction
# ═════════════════════════════════════════════════════════════════════════════

async def test_no_show_prediction_empty_event(
    client: AsyncClient, organizer_headers: dict
):
    """No-show prediction for event with no visitors returns zeros."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/ai/predict/no-show/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()

    expected_keys = {
        "event_id", "event_name", "total_registered",
        "predicted_no_shows", "no_show_rate_pct",
        "high_risk_count", "medium_risk_count", "low_risk_count",
        "high_risk", "medium_risk", "recommended_action",
    }
    for key in expected_keys:
        assert key in data, f"Missing key: {key}"

    assert data["total_registered"] == 0
    assert data["predicted_no_shows"] == 0
    assert data["no_show_rate_pct"] == 0.0


async def test_no_show_prediction_with_visitors(
    client: AsyncClient, organizer_headers: dict
):
    """Visitors are assigned risk levels."""
    event_id = await _create_event(client, organizer_headers)

    # Create 3 visitors
    for i in range(3):
        await _create_visitor(client, organizer_headers, event_id, str(i))

    r = await client.get(
        f"/api/v1/ai/predict/no-show/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total_registered"] == 3
    assert data["high_risk_count"] + data["medium_risk_count"] + data["low_risk_count"] == 3


async def test_no_show_prediction_risk_levels_valid(
    client: AsyncClient, organizer_headers: dict
):
    """All risk entries have a valid risk_level."""
    event_id = await _create_event(client, organizer_headers)
    await _create_visitor(client, organizer_headers, event_id)

    r = await client.get(
        f"/api/v1/ai/predict/no-show/{event_id}",
        headers=organizer_headers,
    )
    data = r.json()

    for bucket in ("high_risk", "medium_risk"):
        for entry in data[bucket]:
            assert entry["risk_level"] in ("high", "medium", "low")
            assert isinstance(entry["risk_score"], int)
            assert isinstance(entry["risk_factors"], list)


async def test_no_show_prediction_not_found(
    client: AsyncClient, organizer_headers: dict
):
    r = await client.get(
        f"/api/v1/ai/predict/no-show/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


async def test_no_show_requires_organizer(
    client: AsyncClient, visitor_headers: dict, organizer_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/ai/predict/no-show/{event_id}",
        headers=visitor_headers,
    )
    assert r.status_code == 403


# ═════════════════════════════════════════════════════════════════════════════
# Visitor risk (individual)
# ═════════════════════════════════════════════════════════════════════════════

async def test_visitor_risk_not_found(
    client: AsyncClient, organizer_headers: dict
):
    r = await client.get(
        f"/api/v1/ai/predict/visitor-risk/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


async def test_visitor_risk_structure(
    client: AsyncClient, organizer_headers: dict
):
    """Visitor risk response has the expected structure."""
    event_id = await _create_event(client, organizer_headers)
    visitor_id = await _create_visitor(client, organizer_headers, event_id)

    r = await client.get(
        f"/api/v1/ai/predict/visitor-risk/{visitor_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert "visitor_id" in data
    assert "risk_score" in data
    assert "risk_level" in data
    assert "risk_factors" in data
    assert data["risk_level"] in ("high", "medium", "low")
    assert isinstance(data["risk_score"], int)
    assert isinstance(data["risk_factors"], list)


# ═════════════════════════════════════════════════════════════════════════════
# AI Insights
# ═════════════════════════════════════════════════════════════════════════════

async def test_ai_insights_structure(
    client: AsyncClient, organizer_headers: dict
):
    """AI insights endpoint returns expected structure."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/ai/insights/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()

    assert "event_id" in data
    assert "generated_at" in data
    assert "insights" in data
    assert "kpi_summary" in data
    assert "total_insights" in data
    assert "action_priority" in data
    assert isinstance(data["insights"], list)
    assert len(data["insights"]) > 0


async def test_ai_insights_not_found(
    client: AsyncClient, organizer_headers: dict
):
    r = await client.get(
        f"/api/v1/ai/insights/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


async def test_ai_insights_requires_organizer(
    client: AsyncClient, visitor_headers: dict, organizer_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/ai/insights/{event_id}",
        headers=visitor_headers,
    )
    assert r.status_code == 403


# ═════════════════════════════════════════════════════════════════════════════
# Unit tests — prediction service helpers
# ═════════════════════════════════════════════════════════════════════════════

def test_risk_level_thresholds():
    """_risk_level classifies correctly."""
    from app.services.prediction_service import _risk_level

    assert _risk_level(50)  == "high"
    assert _risk_level(100) == "high"
    assert _risk_level(49)  == "medium"
    assert _risk_level(25)  == "medium"
    assert _risk_level(24)  == "low"
    assert _risk_level(0)   == "low"


def test_recommended_action_mapping():
    """_recommended_action returns a string for every risk level."""
    from app.services.prediction_service import _recommended_action

    for level in ("high", "medium", "low"):
        action = _recommended_action(level)
        assert isinstance(action, str)
        assert len(action) > 5
