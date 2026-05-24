"""
tests/test_events.py
─────────────────────
Comprehensive tests for /api/v1/events endpoints.

Covers:
  - CRUD lifecycle (create → read → update → delete)
  - Status filter, category filter, year filter on list
  - Stats and dashboard endpoints
  - Validation errors (date order, invalid status)
  - Authorization: organizer can create, visitor cannot
  - 404 handling for unknown IDs
"""

import pytest
from httpx import AsyncClient

# ── Fixtures & helpers ─────────────────────────────────────────────────────────

EVENT_BASE = {
    "name": "Salon Agroalimentaire Maroc 2026",
    "start_date": "2026-06-01",
    "end_date": "2026-06-04",
    "venue": "Foire Internationale de Casablanca",
    "city": "Casablanca",
    "country": "Morocco",
    "capacity": 5000,
    "category": "salon",
    "description": "Le plus grand salon agroalimentaire du Maroc.",
    "budget_mad": 500000,
}

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"


# ── POST /api/v1/events ────────────────────────────────────────────────────────

async def test_create_event_organizer(client: AsyncClient, organizer_headers: dict):
    """Organizer can create an event; response has all required fields."""
    response = await client.post("/api/v1/events", json=EVENT_BASE, headers=organizer_headers)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["name"] == EVENT_BASE["name"]
    assert data["status"] == "draft"
    assert data["city"] == "Casablanca"
    assert "id" in data
    assert "slug" in data
    assert "created_at" in data
    assert "updated_at" in data


async def test_create_event_slug_auto_generated(client: AsyncClient, organizer_headers: dict):
    """Slug is auto-generated from name when not provided."""
    payload = {**EVENT_BASE, "name": "Tech Summit Rabat 2026"}
    response = await client.post("/api/v1/events", json=payload, headers=organizer_headers)
    assert response.status_code == 201
    data = response.json()
    assert "tech" in data["slug"].lower() or "summit" in data["slug"].lower()


async def test_create_event_custom_slug(client: AsyncClient, organizer_headers: dict):
    """Custom slug provided by caller is preserved (lowercased)."""
    payload = {**EVENT_BASE, "name": "Custom Slug Event", "slug": "My Custom Slug"}
    response = await client.post("/api/v1/events", json=payload, headers=organizer_headers)
    assert response.status_code == 201
    assert response.json()["slug"] == "my-custom-slug"


async def test_create_event_visitor_forbidden(client: AsyncClient, visitor_headers: dict):
    """Visitor role cannot create an event (403)."""
    response = await client.post("/api/v1/events", json=EVENT_BASE, headers=visitor_headers)
    assert response.status_code == 403


async def test_create_event_unauthenticated(client: AsyncClient):
    """Unauthenticated request returns 401."""
    response = await client.post("/api/v1/events", json=EVENT_BASE)
    assert response.status_code == 401


async def test_create_event_invalid_dates(client: AsyncClient, organizer_headers: dict):
    """end_date before start_date fails with 422."""
    payload = {**EVENT_BASE, "start_date": "2026-06-10", "end_date": "2026-06-05"}
    response = await client.post("/api/v1/events", json=payload, headers=organizer_headers)
    assert response.status_code == 422


async def test_create_event_missing_required(client: AsyncClient, organizer_headers: dict):
    """Missing required fields (name, start_date, end_date) returns 422."""
    response = await client.post("/api/v1/events", json={"city": "Rabat"}, headers=organizer_headers)
    assert response.status_code == 422


# ── GET /api/v1/events ────────────────────────────────────────────────────────

async def test_list_events(client: AsyncClient, organizer_headers: dict):
    """List endpoint returns an array (possibly empty)."""
    response = await client.get("/api/v1/events", headers=organizer_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_list_events_pagination(client: AsyncClient, organizer_headers: dict):
    """Pagination parameters are accepted and respected."""
    response = await client.get("/api/v1/events?page=1&limit=5", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) <= 5


async def test_list_events_filter_by_status(client: AsyncClient, organizer_headers: dict):
    """Filtering by status only returns matching events."""
    # Create a draft event
    await client.post("/api/v1/events", json=EVENT_BASE, headers=organizer_headers)
    response = await client.get("/api/v1/events?status=draft", headers=organizer_headers)
    assert response.status_code == 200
    for ev in response.json():
        assert ev["status"] == "draft"


async def test_list_events_filter_by_category(client: AsyncClient, organizer_headers: dict):
    """Category filter works correctly."""
    response = await client.get("/api/v1/events?category=salon", headers=organizer_headers)
    assert response.status_code == 200
    for ev in response.json():
        assert ev["category"] == "salon"


async def test_list_events_filter_by_year(client: AsyncClient, organizer_headers: dict):
    """Year filter returns events with start_date in that year."""
    response = await client.get("/api/v1/events?year=2026", headers=organizer_headers)
    assert response.status_code == 200
    for ev in response.json():
        assert ev["start_date"].startswith("2026")


async def test_list_events_unauthenticated(client: AsyncClient):
    """Unauthenticated list request returns 401."""
    response = await client.get("/api/v1/events")
    assert response.status_code == 401


# ── GET /api/v1/events/{id} ───────────────────────────────────────────────────

async def test_get_event_by_id(client: AsyncClient, organizer_headers: dict):
    """Create then fetch an event by ID."""
    create_resp = await client.post("/api/v1/events", json=EVENT_BASE, headers=organizer_headers)
    assert create_resp.status_code == 201
    event_id = create_resp.json()["id"]

    get_resp = await client.get(f"/api/v1/events/{event_id}", headers=organizer_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == event_id
    assert get_resp.json()["name"] == EVENT_BASE["name"]


async def test_get_event_not_found(client: AsyncClient, organizer_headers: dict):
    """Unknown UUID returns 404 with meaningful detail."""
    response = await client.get(f"/api/v1/events/{NONEXISTENT_ID}", headers=organizer_headers)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


# ── PUT /api/v1/events/{id} ───────────────────────────────────────────────────

async def test_update_event(client: AsyncClient, organizer_headers: dict):
    """Partial update changes only the specified fields."""
    create_resp = await client.post("/api/v1/events", json=EVENT_BASE, headers=organizer_headers)
    event_id = create_resp.json()["id"]

    update_resp = await client.put(
        f"/api/v1/events/{event_id}",
        json={"status": "published", "city": "Rabat"},
        headers=organizer_headers,
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["status"] == "published"
    assert updated["city"] == "Rabat"
    assert updated["name"] == EVENT_BASE["name"]  # unchanged


async def test_update_event_invalid_status(client: AsyncClient, organizer_headers: dict):
    """Providing an invalid status value returns 422."""
    create_resp = await client.post("/api/v1/events", json=EVENT_BASE, headers=organizer_headers)
    event_id = create_resp.json()["id"]
    response = await client.put(
        f"/api/v1/events/{event_id}",
        json={"status": "invalid_status"},
        headers=organizer_headers,
    )
    assert response.status_code == 422


async def test_update_event_not_found(client: AsyncClient, organizer_headers: dict):
    """Updating non-existent event returns 404."""
    response = await client.put(
        f"/api/v1/events/{NONEXISTENT_ID}",
        json={"status": "published"},
        headers=organizer_headers,
    )
    assert response.status_code == 404


# ── DELETE /api/v1/events/{id} ────────────────────────────────────────────────

async def test_delete_event_soft(client: AsyncClient, organizer_headers: dict):
    """DELETE sets status to 'cancelled' (soft delete)."""
    create_resp = await client.post("/api/v1/events", json=EVENT_BASE, headers=organizer_headers)
    event_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/api/v1/events/{event_id}", headers=organizer_headers)
    assert del_resp.status_code == 200
    assert "archived" in del_resp.json()["message"].lower() or \
           "cancelled" in del_resp.json()["message"].lower()

    # Event still exists but status is cancelled
    get_resp = await client.get(f"/api/v1/events/{event_id}", headers=organizer_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "cancelled"


async def test_delete_event_not_found(client: AsyncClient, organizer_headers: dict):
    """Deleting unknown event returns 404."""
    response = await client.delete(f"/api/v1/events/{NONEXISTENT_ID}", headers=organizer_headers)
    assert response.status_code == 404


# ── GET /api/v1/events/{id}/stats ─────────────────────────────────────────────

async def test_event_stats(client: AsyncClient, organizer_headers: dict):
    """Stats endpoint returns all KPI fields with correct types."""
    create_resp = await client.post("/api/v1/events", json=EVENT_BASE, headers=organizer_headers)
    event_id = create_resp.json()["id"]

    stats_resp = await client.get(f"/api/v1/events/{event_id}/stats", headers=organizer_headers)
    assert stats_resp.status_code == 200
    stats = stats_resp.json()

    assert stats["event_id"] == event_id
    assert isinstance(stats["total_visitors"], int)
    assert isinstance(stats["total_exhibitors"], int)
    assert isinstance(stats["total_revenue_mad"], float)
    assert isinstance(stats["total_leads"], int)
    assert isinstance(stats["confirmed_visitors"], int)
    assert isinstance(stats["occupancy_rate"], float)
    assert 0.0 <= stats["occupancy_rate"] <= 1.0

    # Fresh event has zeros
    assert stats["total_visitors"] == 0
    assert stats["total_exhibitors"] == 0
    assert stats["total_revenue_mad"] == 0.0


async def test_event_stats_not_found(client: AsyncClient, organizer_headers: dict):
    """Stats for unknown event returns 404."""
    response = await client.get(f"/api/v1/events/{NONEXISTENT_ID}/stats", headers=organizer_headers)
    assert response.status_code == 404


# ── GET /api/v1/events/{id}/dashboard ────────────────────────────────────────

async def test_event_dashboard(client: AsyncClient, organizer_headers: dict):
    """Dashboard returns event, stats, recent_exhibitors, upcoming_sessions."""
    create_resp = await client.post("/api/v1/events", json=EVENT_BASE, headers=organizer_headers)
    event_id = create_resp.json()["id"]

    dash_resp = await client.get(f"/api/v1/events/{event_id}/dashboard", headers=organizer_headers)
    assert dash_resp.status_code == 200
    dash = dash_resp.json()

    assert "event" in dash
    assert "stats" in dash
    assert "recent_exhibitors" in dash
    assert "upcoming_sessions" in dash
    assert isinstance(dash["recent_exhibitors"], list)
    assert isinstance(dash["upcoming_sessions"], list)
    assert dash["event"]["id"] == event_id


async def test_event_dashboard_visitor_forbidden(client: AsyncClient, visitor_headers: dict, organizer_headers: dict):
    """Dashboard requires organizer/admin role."""
    create_resp = await client.post("/api/v1/events", json=EVENT_BASE, headers=organizer_headers)
    event_id = create_resp.json()["id"]

    response = await client.get(f"/api/v1/events/{event_id}/dashboard", headers=visitor_headers)
    assert response.status_code == 403


# ── Full lifecycle ─────────────────────────────────────────────────────────────

async def test_full_event_lifecycle(client: AsyncClient, organizer_headers: dict):
    """End-to-end: create → publish → complete → archive."""
    # Create
    r = await client.post("/api/v1/events", json=EVENT_BASE, headers=organizer_headers)
    assert r.status_code == 201
    eid = r.json()["id"]
    assert r.json()["status"] == "draft"

    # Publish
    r = await client.put(f"/api/v1/events/{eid}", json={"status": "published"}, headers=organizer_headers)
    assert r.json()["status"] == "published"

    # Set ongoing
    r = await client.put(f"/api/v1/events/{eid}", json={"status": "ongoing"}, headers=organizer_headers)
    assert r.json()["status"] == "ongoing"

    # Complete
    r = await client.put(f"/api/v1/events/{eid}", json={"status": "completed"}, headers=organizer_headers)
    assert r.json()["status"] == "completed"

    # Archive (soft-delete)
    r = await client.delete(f"/api/v1/events/{eid}", headers=organizer_headers)
    assert r.status_code == 200

    # Verify archived
    r = await client.get(f"/api/v1/events/{eid}", headers=organizer_headers)
    assert r.json()["status"] == "cancelled"
