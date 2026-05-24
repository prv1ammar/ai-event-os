"""
tests/test_exhibitors.py
─────────────────────────
Comprehensive tests for /api/v1/exhibitors endpoints.

Covers:
  - CRUD lifecycle (register → read → update → status → leads → PDF)
  - Filter by status / sector / event_id
  - Status validation flow (pending → validated / refused)
  - PDF offer download (bytes, content-type)
  - 404 handling and validation errors
"""

import pytest
from httpx import AsyncClient

# ── Fixtures & helpers ─────────────────────────────────────────────────────────

EVENT_PAYLOAD = {
    "name": "Salon Tech Maroc 2026",
    "start_date": "2026-09-15",
    "end_date": "2026-09-18",
    "venue": "Centre Mohammed VI des Congrès",
    "city": "Rabat",
    "capacity": 3000,
    "category": "technology",
}

EXHIBITOR_BASE = {
    "company_name": "DataSphere SARL",
    "sector": "Technology",
    "size": "sme",
    "contact_name": "Youssef El Amrani",
    "contact_email": "youssef@datasphere.ma",
    "contact_phone": "+212661234567",
    "country": "Morocco",
    "website": "https://datasphere.ma",
    "package": "premium",
}

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _create_event(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/events", json=EVENT_PAYLOAD, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_exhibitor(client: AsyncClient, headers: dict, event_id: str) -> dict:
    payload = {**EXHIBITOR_BASE, "event_id": event_id}
    r = await client.post("/api/v1/exhibitors", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── POST /api/v1/exhibitors ────────────────────────────────────────────────────

async def test_register_exhibitor(client: AsyncClient, organizer_headers: dict):
    """Registering an exhibitor returns 201 with pending status."""
    event_id = await _create_event(client, organizer_headers)
    data = await _create_exhibitor(client, organizer_headers, event_id)

    assert data["status"] == "pending"
    assert data["company_name"] == EXHIBITOR_BASE["company_name"]
    assert data["event_id"] == event_id
    assert "id" in data
    assert data["booth_reservations"] == []


async def test_register_exhibitor_invalid_event(client: AsyncClient, organizer_headers: dict):
    """Registering for non-existent event returns 404."""
    payload = {**EXHIBITOR_BASE, "event_id": NONEXISTENT_ID}
    response = await client.post("/api/v1/exhibitors", json=payload, headers=organizer_headers)
    assert response.status_code == 404


async def test_register_exhibitor_invalid_email(client: AsyncClient, organizer_headers: dict):
    """Invalid email format returns 422."""
    event_id = await _create_event(client, organizer_headers)
    payload = {**EXHIBITOR_BASE, "event_id": event_id, "contact_email": "not-an-email"}
    response = await client.post("/api/v1/exhibitors", json=payload, headers=organizer_headers)
    assert response.status_code == 422


async def test_register_exhibitor_invalid_size(client: AsyncClient, organizer_headers: dict):
    """Invalid size enum value returns 422."""
    event_id = await _create_event(client, organizer_headers)
    payload = {**EXHIBITOR_BASE, "event_id": event_id, "size": "giant"}
    response = await client.post("/api/v1/exhibitors", json=payload, headers=organizer_headers)
    assert response.status_code == 422


async def test_register_exhibitor_invalid_package(client: AsyncClient, organizer_headers: dict):
    """Invalid package enum value returns 422."""
    event_id = await _create_event(client, organizer_headers)
    payload = {**EXHIBITOR_BASE, "event_id": event_id, "package": "diamond"}
    response = await client.post("/api/v1/exhibitors", json=payload, headers=organizer_headers)
    assert response.status_code == 422


async def test_register_exhibitor_unauthenticated(client: AsyncClient, organizer_headers: dict):
    """Unauthenticated request returns 401."""
    event_id = await _create_event(client, organizer_headers)
    payload = {**EXHIBITOR_BASE, "event_id": event_id}
    response = await client.post("/api/v1/exhibitors", json=payload)
    assert response.status_code == 401


# ── GET /api/v1/exhibitors ─────────────────────────────────────────────────────

async def test_list_exhibitors(client: AsyncClient, organizer_headers: dict):
    """List endpoint returns array."""
    response = await client.get("/api/v1/exhibitors", headers=organizer_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_list_exhibitors_filter_by_event(client: AsyncClient, organizer_headers: dict):
    """event_id filter restricts to that event's exhibitors."""
    event_id = await _create_event(client, organizer_headers)
    await _create_exhibitor(client, organizer_headers, event_id)

    response = await client.get(f"/api/v1/exhibitors?event_id={event_id}", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert all(ex["event_id"] == event_id for ex in data)


async def test_list_exhibitors_filter_by_status(client: AsyncClient, organizer_headers: dict):
    """Status filter returns only matching exhibitors."""
    event_id = await _create_event(client, organizer_headers)
    await _create_exhibitor(client, organizer_headers, event_id)

    response = await client.get("/api/v1/exhibitors?status=pending", headers=organizer_headers)
    assert response.status_code == 200
    for ex in response.json():
        assert ex["status"] == "pending"


async def test_list_exhibitors_filter_by_sector(client: AsyncClient, organizer_headers: dict):
    """Sector filter returns only matching exhibitors."""
    event_id = await _create_event(client, organizer_headers)
    await _create_exhibitor(client, organizer_headers, event_id)

    response = await client.get("/api/v1/exhibitors?sector=Technology", headers=organizer_headers)
    assert response.status_code == 200
    for ex in response.json():
        assert ex["sector"] == "Technology"


async def test_list_exhibitors_pagination(client: AsyncClient, organizer_headers: dict):
    """Pagination limit is respected."""
    response = await client.get("/api/v1/exhibitors?page=1&limit=3", headers=organizer_headers)
    assert response.status_code == 200
    assert len(response.json()) <= 3


# ── GET /api/v1/exhibitors/{id} ────────────────────────────────────────────────

async def test_get_exhibitor_by_id(client: AsyncClient, organizer_headers: dict):
    """Detail endpoint returns full exhibitor with booth_reservations list."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_exhibitor(client, organizer_headers, event_id)
    exhibitor_id = created["id"]

    response = await client.get(f"/api/v1/exhibitors/{exhibitor_id}", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == exhibitor_id
    assert "booth_reservations" in data


async def test_get_exhibitor_not_found(client: AsyncClient, organizer_headers: dict):
    """Unknown exhibitor ID returns 404."""
    response = await client.get(f"/api/v1/exhibitors/{NONEXISTENT_ID}", headers=organizer_headers)
    assert response.status_code == 404


# ── PUT /api/v1/exhibitors/{id} ────────────────────────────────────────────────

async def test_update_exhibitor(client: AsyncClient, organizer_headers: dict):
    """Partial update modifies only supplied fields."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_exhibitor(client, organizer_headers, event_id)
    exhibitor_id = created["id"]

    response = await client.put(
        f"/api/v1/exhibitors/{exhibitor_id}",
        json={"company_name": "DataSphere International", "package": "gold"},
        headers=organizer_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["company_name"] == "DataSphere International"
    assert data["package"] == "gold"
    assert data["contact_name"] == EXHIBITOR_BASE["contact_name"]  # unchanged


async def test_update_exhibitor_not_found(client: AsyncClient, organizer_headers: dict):
    """Updating non-existent exhibitor returns 404."""
    response = await client.put(
        f"/api/v1/exhibitors/{NONEXISTENT_ID}",
        json={"company_name": "Ghost"},
        headers=organizer_headers,
    )
    assert response.status_code == 404


# ── PUT /api/v1/exhibitors/{id}/status ────────────────────────────────────────

async def test_validate_exhibitor(client: AsyncClient, organizer_headers: dict):
    """Organizer can validate an exhibitor (pending → validated)."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_exhibitor(client, organizer_headers, event_id)
    exhibitor_id = created["id"]

    response = await client.put(
        f"/api/v1/exhibitors/{exhibitor_id}/status",
        json={"status": "validated"},
        headers=organizer_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "validated"


async def test_refuse_exhibitor(client: AsyncClient, organizer_headers: dict):
    """Organizer can refuse an exhibitor with an optional reason."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_exhibitor(client, organizer_headers, event_id)
    exhibitor_id = created["id"]

    response = await client.put(
        f"/api/v1/exhibitors/{exhibitor_id}/status",
        json={"status": "refused", "reason": "Dossier incomplet"},
        headers=organizer_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "refused"


async def test_invalid_status_transition(client: AsyncClient, organizer_headers: dict):
    """Setting an unrecognized status returns 422."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_exhibitor(client, organizer_headers, event_id)
    exhibitor_id = created["id"]

    response = await client.put(
        f"/api/v1/exhibitors/{exhibitor_id}/status",
        json={"status": "approved"},   # not a valid status
        headers=organizer_headers,
    )
    assert response.status_code == 422


async def test_status_visitor_forbidden(client: AsyncClient, organizer_headers: dict, visitor_headers: dict):
    """Visitor cannot change exhibitor status (403)."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_exhibitor(client, organizer_headers, event_id)
    exhibitor_id = created["id"]

    response = await client.put(
        f"/api/v1/exhibitors/{exhibitor_id}/status",
        json={"status": "validated"},
        headers=visitor_headers,
    )
    assert response.status_code == 403


# ── GET /api/v1/exhibitors/{id}/leads ─────────────────────────────────────────

async def test_get_exhibitor_leads_empty(client: AsyncClient, organizer_headers: dict):
    """Fresh exhibitor has no leads."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_exhibitor(client, organizer_headers, event_id)
    exhibitor_id = created["id"]

    response = await client.get(
        f"/api/v1/exhibitors/{exhibitor_id}/leads",
        headers=organizer_headers,
    )
    assert response.status_code == 200
    assert response.json() == []


async def test_get_exhibitor_leads_not_found(client: AsyncClient, organizer_headers: dict):
    """Leads for non-existent exhibitor returns 404."""
    response = await client.get(
        f"/api/v1/exhibitors/{NONEXISTENT_ID}/leads",
        headers=organizer_headers,
    )
    assert response.status_code == 404


# ── GET /api/v1/exhibitors/{id}/offer.pdf ─────────────────────────────────────

async def test_get_offer_pdf_returns_pdf(client: AsyncClient, organizer_headers: dict):
    """PDF endpoint returns bytes with application/pdf content type."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_exhibitor(client, organizer_headers, event_id)
    exhibitor_id = created["id"]

    response = await client.get(
        f"/api/v1/exhibitors/{exhibitor_id}/offer.pdf",
        headers=organizer_headers,
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    # PDF magic bytes
    assert response.content[:4] == b"%PDF"


async def test_get_offer_pdf_content_disposition(client: AsyncClient, organizer_headers: dict):
    """PDF response has Content-Disposition attachment header."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_exhibitor(client, organizer_headers, event_id)
    exhibitor_id = created["id"]

    response = await client.get(
        f"/api/v1/exhibitors/{exhibitor_id}/offer.pdf",
        headers=organizer_headers,
    )
    assert "content-disposition" in response.headers
    assert "attachment" in response.headers["content-disposition"]


async def test_get_offer_pdf_not_found(client: AsyncClient, organizer_headers: dict):
    """PDF for non-existent exhibitor returns 404."""
    response = await client.get(
        f"/api/v1/exhibitors/{NONEXISTENT_ID}/offer.pdf",
        headers=organizer_headers,
    )
    assert response.status_code == 404


# ── Full lifecycle ─────────────────────────────────────────────────────────────

async def test_full_exhibitor_lifecycle(client: AsyncClient, organizer_headers: dict):
    """End-to-end: register → validate → update → fetch leads → PDF."""
    # 1. Create event
    event_id = await _create_event(client, organizer_headers)

    # 2. Register exhibitor
    payload = {**EXHIBITOR_BASE, "event_id": event_id, "contact_email": "full@test.ma"}
    r = await client.post("/api/v1/exhibitors", json=payload, headers=organizer_headers)
    assert r.status_code == 201
    ex_id = r.json()["id"]
    assert r.json()["status"] == "pending"

    # 3. Validate
    r = await client.put(f"/api/v1/exhibitors/{ex_id}/status", json={"status": "validated"}, headers=organizer_headers)
    assert r.json()["status"] == "validated"

    # 4. Update package
    r = await client.put(f"/api/v1/exhibitors/{ex_id}", json={"package": "platinum"}, headers=organizer_headers)
    assert r.json()["package"] == "platinum"

    # 5. Leads (empty)
    r = await client.get(f"/api/v1/exhibitors/{ex_id}/leads", headers=organizer_headers)
    assert r.status_code == 200

    # 6. PDF offer
    r = await client.get(f"/api/v1/exhibitors/{ex_id}/offer.pdf", headers=organizer_headers)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"
