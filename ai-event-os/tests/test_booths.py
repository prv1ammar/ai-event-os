"""
tests/test_booths.py
─────────────────────
Tests for /api/v1/booths endpoints, including the floor-plan endpoint.

Covers:
  - CRUD lifecycle
  - Reservation flow (exhibitor must be validated)
  - Business-rule violations (booth not available, exhibitor not validated)
  - Floor-plan structure and occupancy calculation
  - Filters: event_id, zone, status
"""

import pytest
from httpx import AsyncClient

# ── Constants ──────────────────────────────────────────────────────────────────

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"

EVENT_PAYLOAD = {
    "name": "Foire Industrielle Casablanca 2026",
    "start_date": "2026-11-05",
    "end_date": "2026-11-08",
    "venue": "Foire Internationale de Casablanca",
    "city": "Casablanca",
    "capacity": 8000,
    "category": "industrie",
}

EXHIBITOR_PAYLOAD = {
    "company_name": "Acier Maroc SA",
    "contact_name": "Karima Tazi",
    "contact_email": "karima.tazi@aciermaroc.ma",
    "package": "gold",
}

BOOTH_BASE = {
    "number": "A01",
    "zone": "Hall A",
    "size_m2": 18.0,
    "price_mad": 25000,
}


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _create_event(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/events", json=EVENT_PAYLOAD, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_exhibitor(
    client: AsyncClient, headers: dict, event_id: str, email: str = "karima.tazi@aciermaroc.ma"
) -> str:
    payload = {**EXHIBITOR_PAYLOAD, "event_id": event_id, "contact_email": email}
    r = await client.post("/api/v1/exhibitors", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _validate_exhibitor(client: AsyncClient, headers: dict, exhibitor_id: str):
    r = await client.put(
        f"/api/v1/exhibitors/{exhibitor_id}/status",
        json={"status": "validated"},
        headers=headers,
    )
    assert r.status_code == 200


async def _create_booth(
    client: AsyncClient, headers: dict, event_id: str, number: str = "A01"
) -> dict:
    payload = {**BOOTH_BASE, "event_id": event_id, "number": number}
    r = await client.post("/api/v1/booths", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── POST /api/v1/booths ───────────────────────────────────────────────────────

async def test_create_booth(client: AsyncClient, organizer_headers: dict):
    """Organizer creates booth; default status is 'available'."""
    event_id = await _create_event(client, organizer_headers)
    data = await _create_booth(client, organizer_headers, event_id)

    assert data["number"] == "A01"
    assert data["status"] == "available"
    assert data["event_id"] == event_id
    assert data["price_mad"] == 25000
    assert data["zone"] == "Hall A"


async def test_create_booth_visitor_forbidden(client: AsyncClient, organizer_headers: dict, visitor_headers: dict):
    """Visitor cannot create booths (403)."""
    event_id = await _create_event(client, organizer_headers)
    payload = {**BOOTH_BASE, "event_id": event_id}
    response = await client.post("/api/v1/booths", json=payload, headers=visitor_headers)
    assert response.status_code == 403


async def test_create_booth_invalid_event(client: AsyncClient, organizer_headers: dict):
    """Creating booth for non-existent event returns 404."""
    payload = {**BOOTH_BASE, "event_id": NONEXISTENT_ID}
    response = await client.post("/api/v1/booths", json=payload, headers=organizer_headers)
    assert response.status_code == 404


# ── GET /api/v1/booths ────────────────────────────────────────────────────────

async def test_list_booths(client: AsyncClient, organizer_headers: dict):
    """List returns array."""
    response = await client.get("/api/v1/booths", headers=organizer_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_list_booths_filter_by_event(client: AsyncClient, organizer_headers: dict):
    """event_id filter restricts results."""
    event_id = await _create_event(client, organizer_headers)
    await _create_booth(client, organizer_headers, event_id, "B01")

    response = await client.get(f"/api/v1/booths?event_id={event_id}", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert all(b["event_id"] == event_id for b in data)


async def test_list_booths_filter_by_zone(client: AsyncClient, organizer_headers: dict):
    """Zone filter returns only booths in that zone."""
    event_id = await _create_event(client, organizer_headers)
    await _create_booth(client, organizer_headers, event_id, "C01")

    response = await client.get(f"/api/v1/booths?event_id={event_id}&zone=Hall+A", headers=organizer_headers)
    assert response.status_code == 200
    for b in response.json():
        assert b["zone"] == "Hall A"


async def test_list_booths_filter_by_status(client: AsyncClient, organizer_headers: dict):
    """Status filter works correctly."""
    event_id = await _create_event(client, organizer_headers)
    await _create_booth(client, organizer_headers, event_id, "D01")

    response = await client.get(f"/api/v1/booths?event_id={event_id}&status=available", headers=organizer_headers)
    assert response.status_code == 200
    for b in response.json():
        assert b["status"] == "available"


# ── GET /api/v1/booths/{id} ───────────────────────────────────────────────────

async def test_get_booth_by_id(client: AsyncClient, organizer_headers: dict):
    """Fetching booth by ID returns correct data."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_booth(client, organizer_headers, event_id, "E01")
    booth_id = created["id"]

    response = await client.get(f"/api/v1/booths/{booth_id}", headers=organizer_headers)
    assert response.status_code == 200
    assert response.json()["id"] == booth_id


async def test_get_booth_not_found(client: AsyncClient, organizer_headers: dict):
    """Unknown booth returns 404."""
    response = await client.get(f"/api/v1/booths/{NONEXISTENT_ID}", headers=organizer_headers)
    assert response.status_code == 404


# ── PUT /api/v1/booths/{id} ───────────────────────────────────────────────────

async def test_update_booth(client: AsyncClient, organizer_headers: dict):
    """Partial update changes only specified fields."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_booth(client, organizer_headers, event_id, "F01")
    booth_id = created["id"]

    response = await client.put(
        f"/api/v1/booths/{booth_id}",
        json={"price_mad": 30000, "zone": "Hall B"},
        headers=organizer_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["price_mad"] == 30000
    assert data["zone"] == "Hall B"
    assert data["number"] == "F01"  # unchanged


async def test_update_booth_invalid_status(client: AsyncClient, organizer_headers: dict):
    """Invalid status value returns 422."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_booth(client, organizer_headers, event_id, "G01")
    booth_id = created["id"]

    response = await client.put(
        f"/api/v1/booths/{booth_id}",
        json={"status": "broken"},
        headers=organizer_headers,
    )
    assert response.status_code == 422


# ── POST /api/v1/booths/{id}/reserve ─────────────────────────────────────────

async def test_reserve_booth_validated_exhibitor(client: AsyncClient, organizer_headers: dict):
    """Validated exhibitor can successfully reserve an available booth."""
    event_id = await _create_event(client, organizer_headers)
    exhibitor_id = await _create_exhibitor(client, organizer_headers, event_id, "reserve@test.ma")
    await _validate_exhibitor(client, organizer_headers, exhibitor_id)
    booth = await _create_booth(client, organizer_headers, event_id, "H01")
    booth_id = booth["id"]

    response = await client.post(
        f"/api/v1/booths/{booth_id}/reserve",
        json={"exhibitor_id": exhibitor_id},
        headers=organizer_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["booth_id"] == booth_id
    assert data["exhibitor_id"] == exhibitor_id
    assert data["status"] == "pending"
    assert data["payment_status"] == "pending"
    assert data["price_mad"] == booth["price_mad"]  # defaults to listed price


async def test_reserve_booth_custom_price(client: AsyncClient, organizer_headers: dict):
    """Custom negotiated price overrides the listed price."""
    event_id = await _create_event(client, organizer_headers)
    exhibitor_id = await _create_exhibitor(client, organizer_headers, event_id, "custom@test.ma")
    await _validate_exhibitor(client, organizer_headers, exhibitor_id)
    booth = await _create_booth(client, organizer_headers, event_id, "I01")
    booth_id = booth["id"]

    response = await client.post(
        f"/api/v1/booths/{booth_id}/reserve",
        json={"exhibitor_id": exhibitor_id, "price_mad": 20000},
        headers=organizer_headers,
    )
    assert response.status_code == 201
    assert response.json()["price_mad"] == 20000


async def test_reserve_booth_status_changes_to_reserved(client: AsyncClient, organizer_headers: dict):
    """After reservation the booth status becomes 'reserved'."""
    event_id = await _create_event(client, organizer_headers)
    exhibitor_id = await _create_exhibitor(client, organizer_headers, event_id, "status@test.ma")
    await _validate_exhibitor(client, organizer_headers, exhibitor_id)
    booth = await _create_booth(client, organizer_headers, event_id, "J01")
    booth_id = booth["id"]

    await client.post(
        f"/api/v1/booths/{booth_id}/reserve",
        json={"exhibitor_id": exhibitor_id},
        headers=organizer_headers,
    )

    booth_resp = await client.get(f"/api/v1/booths/{booth_id}", headers=organizer_headers)
    assert booth_resp.json()["status"] == "reserved"


async def test_reserve_booth_not_available(client: AsyncClient, organizer_headers: dict):
    """Reserving an already-reserved booth returns 409."""
    event_id = await _create_event(client, organizer_headers)
    exhibitor_id = await _create_exhibitor(client, organizer_headers, event_id, "twice@test.ma")
    await _validate_exhibitor(client, organizer_headers, exhibitor_id)
    booth = await _create_booth(client, organizer_headers, event_id, "K01")
    booth_id = booth["id"]

    # First reservation succeeds
    await client.post(f"/api/v1/booths/{booth_id}/reserve", json={"exhibitor_id": exhibitor_id}, headers=organizer_headers)

    # Second reservation fails
    response = await client.post(
        f"/api/v1/booths/{booth_id}/reserve",
        json={"exhibitor_id": exhibitor_id},
        headers=organizer_headers,
    )
    assert response.status_code == 409
    assert "not available" in response.json()["detail"].lower()


async def test_reserve_booth_exhibitor_not_validated(client: AsyncClient, organizer_headers: dict):
    """Pending exhibitor cannot reserve a booth (422)."""
    event_id = await _create_event(client, organizer_headers)
    exhibitor_id = await _create_exhibitor(client, organizer_headers, event_id, "pending@test.ma")
    # Do NOT validate
    booth = await _create_booth(client, organizer_headers, event_id, "L01")
    booth_id = booth["id"]

    response = await client.post(
        f"/api/v1/booths/{booth_id}/reserve",
        json={"exhibitor_id": exhibitor_id},
        headers=organizer_headers,
    )
    assert response.status_code == 422
    assert "validated" in response.json()["detail"].lower()


async def test_reserve_booth_exhibitor_not_found(client: AsyncClient, organizer_headers: dict):
    """Reserving for non-existent exhibitor returns 404."""
    event_id = await _create_event(client, organizer_headers)
    booth = await _create_booth(client, organizer_headers, event_id, "M01")
    booth_id = booth["id"]

    response = await client.post(
        f"/api/v1/booths/{booth_id}/reserve",
        json={"exhibitor_id": NONEXISTENT_ID},
        headers=organizer_headers,
    )
    assert response.status_code == 404


# ── GET /api/v1/booths/floor-plan/{event_id} ─────────────────────────────────

async def test_floor_plan_empty_event(client: AsyncClient, organizer_headers: dict):
    """Event with no booths returns empty floor plan."""
    event_id = await _create_event(client, organizer_headers)
    response = await client.get(f"/api/v1/booths/floor-plan/{event_id}", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["event_id"] == event_id
    assert data["total_booths"] == 0
    assert data["overall_occupancy_pct"] == 0.0
    assert data["zones"] == []


async def test_floor_plan_with_booths(client: AsyncClient, organizer_headers: dict):
    """Floor plan correctly groups booths by zone with occupancy data."""
    event_id = await _create_event(client, organizer_headers)

    # Create 2 booths in Hall A and 1 in Hall B
    await _create_booth(client, organizer_headers, event_id, "N01")
    await client.post(
        "/api/v1/booths",
        json={**BOOTH_BASE, "number": "N02", "event_id": event_id},
        headers=organizer_headers,
    )
    await client.post(
        "/api/v1/booths",
        json={**BOOTH_BASE, "number": "P01", "zone": "Hall B", "event_id": event_id},
        headers=organizer_headers,
    )

    response = await client.get(f"/api/v1/booths/floor-plan/{event_id}", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total_booths"] == 3
    assert len(data["zones"]) == 2

    # All booths available → 0% occupancy
    assert data["overall_occupancy_pct"] == 0.0

    # Verify zone structure
    zone_names = {z["zone_name"] for z in data["zones"]}
    assert "Hall A" in zone_names
    assert "Hall B" in zone_names

    hall_a = next(z for z in data["zones"] if z["zone_name"] == "Hall A")
    assert hall_a["total_booths"] == 2
    assert hall_a["available"] == 2
    assert hall_a["reserved"] == 0
    assert hall_a["occupancy_pct"] == 0.0
    assert "colour" in hall_a
    assert len(hall_a["booths"]) == 2


async def test_floor_plan_after_reservation(client: AsyncClient, organizer_headers: dict):
    """After a booth reservation the floor plan shows updated occupancy."""
    event_id = await _create_event(client, organizer_headers)
    exhibitor_id = await _create_exhibitor(client, organizer_headers, event_id, "floor@test.ma")
    await _validate_exhibitor(client, organizer_headers, exhibitor_id)

    booth = await _create_booth(client, organizer_headers, event_id, "Q01")
    # Reserve the booth
    await client.post(
        f"/api/v1/booths/{booth['id']}/reserve",
        json={"exhibitor_id": exhibitor_id},
        headers=organizer_headers,
    )

    response = await client.get(f"/api/v1/booths/floor-plan/{event_id}", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total_booths"] == 1
    assert data["overall_occupancy_pct"] == 100.0

    hall_a = data["zones"][0]
    assert hall_a["reserved"] == 1
    assert hall_a["occupancy_pct"] == 100.0
    # Exhibitor info is embedded in the booth
    booth_fp = hall_a["booths"][0]
    assert booth_fp["exhibitor_id"] == exhibitor_id


async def test_floor_plan_not_found(client: AsyncClient, organizer_headers: dict):
    """Floor plan for unknown event returns 404."""
    response = await client.get(
        f"/api/v1/booths/floor-plan/{NONEXISTENT_ID}",
        headers=organizer_headers,
    )
    assert response.status_code == 404


async def test_floor_plan_booth_colours(client: AsyncClient, organizer_headers: dict):
    """Each zone has a colour field populated."""
    event_id = await _create_event(client, organizer_headers)
    await _create_booth(client, organizer_headers, event_id, "R01")

    response = await client.get(f"/api/v1/booths/floor-plan/{event_id}", headers=organizer_headers)
    assert response.status_code == 200
    for zone in response.json()["zones"]:
        assert zone["colour"].startswith("#")
        for booth in zone["booths"]:
            assert booth["colour"].startswith("#")
