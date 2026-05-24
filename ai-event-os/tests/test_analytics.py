"""
tests/test_analytics.py
─────────────────────────
Comprehensive tests for the Phase 6 analytics endpoints.

Covers
──────
- GET /api/v1/analytics/dashboard/{event_id}
- GET /api/v1/analytics/attendance/{event_id}
- GET /api/v1/analytics/entries/live/{event_id}
- GET /api/v1/analytics/heatmap/{event_id}
- GET /api/v1/analytics/top-sessions/{event_id}
- GET /api/v1/analytics/visitor-types/{event_id}
- GET /api/v1/analytics/traffic-sources/{event_id}
- GET /api/v1/analytics/financial/{event_id}
- 404 for unknown event IDs
- Auth guards (401/403)
"""

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

# ── Shared test data ──────────────────────────────────────────────────────────

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"

EVENT_PAYLOAD = {
    "name": "Analytics Test Salon 2026",
    "start_date": "2026-09-01",
    "end_date": "2026-09-03",
    "venue": "Palais des Congrès Casablanca",
    "city": "Casablanca",
    "country": "Morocco",
    "capacity": 3000,
    "category": "trade_show",
    "budget_mad": 800000,
}


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _create_event(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/events", json=EVENT_PAYLOAD, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ═════════════════════════════════════════════════════════════════════════════
# Dashboard KPIs
# ═════════════════════════════════════════════════════════════════════════════

async def test_dashboard_returns_all_fields(
    client: AsyncClient, organizer_headers: dict
):
    """Dashboard response contains all expected KPI keys."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/dashboard/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()

    expected_keys = {
        "event_id", "event_name", "event_status",
        "total_visitors", "total_entries", "entries_today",
        "total_exhibitors", "total_leads", "qualified_leads",
        "meetings_scheduled", "total_revenue_mad", "total_budget_mad",
        "total_expenses_mad", "net_profit_mad", "roi_percent",
        "occupancy_rate", "avg_lead_score", "total_booths",
        "reserved_booths", "capacity",
    }
    for key in expected_keys:
        assert key in data, f"Missing key: {key}"


async def test_dashboard_fresh_event_zeros(
    client: AsyncClient, organizer_headers: dict
):
    """A freshly created event with no data should return zeros."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/dashboard/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total_visitors"] == 0
    assert data["total_exhibitors"] == 0
    assert data["total_leads"] == 0
    assert data["total_revenue_mad"] == 0.0
    assert data["occupancy_rate"] == 0.0


async def test_dashboard_not_found(
    client: AsyncClient, organizer_headers: dict
):
    """Unknown event ID returns 404."""
    r = await client.get(
        f"/api/v1/analytics/dashboard/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


async def test_dashboard_requires_organizer(
    client: AsyncClient, visitor_headers: dict, organizer_headers: dict
):
    """Visitor role cannot access the dashboard (403)."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/dashboard/{event_id}",
        headers=visitor_headers,
    )
    assert r.status_code == 403


async def test_dashboard_requires_auth(client: AsyncClient, organizer_headers: dict):
    """Unauthenticated request returns 401."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(f"/api/v1/analytics/dashboard/{event_id}")
    assert r.status_code == 401


# ═════════════════════════════════════════════════════════════════════════════
# Attendance by day
# ═════════════════════════════════════════════════════════════════════════════

async def test_attendance_returns_list(
    client: AsyncClient, organizer_headers: dict
):
    """Attendance endpoint returns a list (empty for fresh event)."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/attendance/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_attendance_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(
        f"/api/v1/analytics/attendance/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


async def test_attendance_requires_auth(client: AsyncClient, organizer_headers: dict):
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(f"/api/v1/analytics/attendance/{event_id}")
    assert r.status_code == 401


# ═════════════════════════════════════════════════════════════════════════════
# Live entry flux
# ═════════════════════════════════════════════════════════════════════════════

async def test_live_entries_returns_24_slots(
    client: AsyncClient, organizer_headers: dict
):
    """Live entry flux always returns exactly 24 hourly slots."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/entries/live/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 24
    for slot in data:
        assert "hour" in slot
        assert "count" in slot
        assert isinstance(slot["count"], int)


async def test_live_entries_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(
        f"/api/v1/analytics/entries/live/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ═════════════════════════════════════════════════════════════════════════════
# Heatmap
# ═════════════════════════════════════════════════════════════════════════════

async def test_heatmap_empty_event(
    client: AsyncClient, organizer_headers: dict
):
    """Heatmap for an event with no booths returns an empty list."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/heatmap/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_heatmap_with_booth(
    client: AsyncClient, organizer_headers: dict
):
    """Heatmap returns correct structure when booths exist."""
    event_id = await _create_event(client, organizer_headers)

    # Create a booth
    booth_payload = {
        "number": "A01",
        "zone": "Hall A",
        "size_m2": 20,
        "price_mad": 5000,
        "event_id": event_id,
    }
    br = await client.post(
        "/api/v1/booths", json=booth_payload, headers=organizer_headers
    )
    if br.status_code not in (200, 201):
        pytest.skip("Booths endpoint not available in this test run")

    r = await client.get(
        f"/api/v1/analytics/heatmap/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if data:
        item = data[0]
        assert "booth" in item
        assert "scans" in item
        assert "activity" in item
        assert item["activity"] in ("faible", "moyenne", "forte", "très forte")
        assert "x" in item
        assert "y" in item


async def test_heatmap_requires_organizer(
    client: AsyncClient, visitor_headers: dict, organizer_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/heatmap/{event_id}",
        headers=visitor_headers,
    )
    assert r.status_code == 403


async def test_heatmap_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(
        f"/api/v1/analytics/heatmap/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ═════════════════════════════════════════════════════════════════════════════
# Activity level logic (unit test — no HTTP)
# ═════════════════════════════════════════════════════════════════════════════

def test_activity_level_thresholds():
    """Unit-test the _activity_level helper directly."""
    from app.services.analytics_service import _activity_level

    assert _activity_level(0)   == "faible"
    assert _activity_level(49)  == "faible"
    assert _activity_level(50)  == "moyenne"
    assert _activity_level(149) == "moyenne"
    assert _activity_level(150) == "forte"
    assert _activity_level(299) == "forte"
    assert _activity_level(300) == "très forte"
    assert _activity_level(999) == "très forte"


# ═════════════════════════════════════════════════════════════════════════════
# Top sessions
# ═════════════════════════════════════════════════════════════════════════════

async def test_top_sessions_empty(client: AsyncClient, organizer_headers: dict):
    """Top sessions for event with no sessions returns empty list."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/top-sessions/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) == 0


async def test_top_sessions_limit_param(
    client: AsyncClient, organizer_headers: dict
):
    """limit query param is accepted and validated."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/top-sessions/{event_id}?limit=5",
        headers=organizer_headers,
    )
    assert r.status_code == 200

    r_bad = await client.get(
        f"/api/v1/analytics/top-sessions/{event_id}?limit=0",
        headers=organizer_headers,
    )
    assert r_bad.status_code == 422


async def test_top_sessions_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(
        f"/api/v1/analytics/top-sessions/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ═════════════════════════════════════════════════════════════════════════════
# Visitor types
# ═════════════════════════════════════════════════════════════════════════════

async def test_visitor_types_structure(
    client: AsyncClient, organizer_headers: dict
):
    """Visitor types endpoint returns a dict with all type keys."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/visitor-types/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "standard" in data
    assert "vip" in data
    assert "press" in data
    assert "total" in data
    assert data["total"] == 0  # fresh event


async def test_visitor_types_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(
        f"/api/v1/analytics/visitor-types/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ═════════════════════════════════════════════════════════════════════════════
# Traffic sources
# ═════════════════════════════════════════════════════════════════════════════

async def test_traffic_sources_empty(
    client: AsyncClient, organizer_headers: dict
):
    """Traffic sources for event with no campaigns returns empty list."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/traffic-sources/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json() == []


async def test_traffic_sources_not_found(
    client: AsyncClient, organizer_headers: dict
):
    r = await client.get(
        f"/api/v1/analytics/traffic-sources/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ═════════════════════════════════════════════════════════════════════════════
# Financial dashboard
# ═════════════════════════════════════════════════════════════════════════════

async def test_financial_dashboard_fields(
    client: AsyncClient, organizer_headers: dict
):
    """Financial dashboard returns all expected fields."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/financial/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    required = {
        "event_id", "event_name",
        "total_revenue_mad", "total_expenses_mad",
        "total_budget_mad", "net_profit_mad",
        "roi_percent", "budget_variance_percent",
        "revenue_by_source", "expenses_by_category",
    }
    for key in required:
        assert key in data, f"Missing key: {key}"


async def test_financial_dashboard_fresh_zeros(
    client: AsyncClient, organizer_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/financial/{event_id}",
        headers=organizer_headers,
    )
    data = r.json()
    assert data["total_revenue_mad"] == 0.0
    assert data["total_expenses_mad"] == 0.0
    assert data["net_profit_mad"] == 0.0


async def test_financial_dashboard_not_found(
    client: AsyncClient, organizer_headers: dict
):
    r = await client.get(
        f"/api/v1/analytics/financial/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert r.status_code == 404


async def test_financial_requires_organizer(
    client: AsyncClient, visitor_headers: dict, organizer_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/analytics/financial/{event_id}",
        headers=visitor_headers,
    )
    assert r.status_code == 403
