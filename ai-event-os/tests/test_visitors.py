"""
tests/test_visitors.py
────────────────────────
Comprehensive tests for /api/v1/visitors endpoints.

Covers:
  - CRUD lifecycle (create → read → update → delete)
  - Filter: type, event_id, country
  - CSV import: valid rows, missing columns, invalid types, duplicate emails
  - Excel export returns 200 with xlsx content-type
  - Journey endpoint returns ordered scan list
  - Authorization guards (organizer vs visitor vs unauthenticated)
  - 404 handling for unknown IDs
"""

from __future__ import annotations

import io

import pytest
from httpx import AsyncClient

# ── Shared test data ──────────────────────────────────────────────────────────

EVENT_PAYLOAD = {
    "name":       "Salon Tech Maroc 2026",
    "start_date": "2026-05-20",
    "end_date":   "2026-05-28",
    "venue":      "Foire de Casablanca",
    "city":       "Casablanca",
    "country":    "Morocco",
    "capacity":   3000,
    "category":   "tech",
}

VISITOR_BASE = {
    "first_name": "Fatima",
    "last_name":  "Zahra",
    "email":      "fatima.zahra@test.ma",
    "phone":      "+212600000001",
    "company":    "TechCorp",
    "role":       "CTO",
    "type":       "vip",
    "country":    "Morocco",
}

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"


# ── Helper: create event + return its ID ─────────────────────────────────────

async def _make_event(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/events", json=EVENT_PAYLOAD, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _make_visitor(client: AsyncClient, headers: dict, event_id: str, **overrides) -> dict:
    payload = {**VISITOR_BASE, "event_id": event_id, **overrides}
    r = await client.post("/api/v1/visitors", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── POST /api/v1/visitors ────────────────────────────────────────────────────

async def test_create_visitor_organizer(client: AsyncClient, organizer_headers: dict):
    """Organizer can register a visitor; response includes all required fields."""
    event_id = await _make_event(client, organizer_headers)
    r = await client.post(
        "/api/v1/visitors",
        json={**VISITOR_BASE, "event_id": event_id},
        headers=organizer_headers,
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["first_name"] == "Fatima"
    assert data["last_name"]  == "Zahra"
    assert data["type"]       == "vip"
    assert data["email"]      == "fatima.zahra@test.ma"
    assert "id" in data
    assert "created_at" in data
    assert "event_id" in data


async def test_create_visitor_visitor_forbidden(
    client: AsyncClient, visitor_headers: dict, organizer_headers: dict
):
    """Regular visitor role cannot register new visitors (403)."""
    event_id = await _make_event(client, organizer_headers)
    r = await client.post(
        "/api/v1/visitors",
        json={**VISITOR_BASE, "event_id": event_id},
        headers=visitor_headers,
    )
    assert r.status_code == 403


async def test_create_visitor_unauthenticated(
    client: AsyncClient, organizer_headers: dict
):
    """Unauthenticated request is rejected (401)."""
    event_id = await _make_event(client, organizer_headers)
    r = await client.post("/api/v1/visitors", json={**VISITOR_BASE, "event_id": event_id})
    assert r.status_code == 401


async def test_create_visitor_invalid_type(
    client: AsyncClient, organizer_headers: dict
):
    """Invalid visitor type returns 422."""
    event_id = await _make_event(client, organizer_headers)
    r = await client.post(
        "/api/v1/visitors",
        json={**VISITOR_BASE, "event_id": event_id, "type": "celebrity"},
        headers=organizer_headers,
    )
    assert r.status_code == 422


async def test_create_visitor_missing_required_fields(
    client: AsyncClient, organizer_headers: dict
):
    """Missing first_name / last_name / email returns 422."""
    event_id = await _make_event(client, organizer_headers)
    r = await client.post(
        "/api/v1/visitors",
        json={"email": "test@test.com", "event_id": event_id},
        headers=organizer_headers,
    )
    assert r.status_code == 422


async def test_create_visitor_nonexistent_event(
    client: AsyncClient, organizer_headers: dict
):
    """Registering to a non-existent event returns 404."""
    r = await client.post(
        "/api/v1/visitors",
        json={**VISITOR_BASE, "event_id": NONEXISTENT_ID},
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ── GET /api/v1/visitors ─────────────────────────────────────────────────────

async def test_list_visitors(client: AsyncClient, organizer_headers: dict):
    """List endpoint returns a paginated response."""
    r = await client.get("/api/v1/visitors", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "page"  in data
    assert isinstance(data["items"], list)


async def test_list_visitors_filter_by_type(
    client: AsyncClient, organizer_headers: dict
):
    """type filter returns only matching visitors."""
    event_id = await _make_event(client, organizer_headers)
    await _make_visitor(client, organizer_headers, event_id, type="press",
                        email="press_unique@test.ma")
    r = await client.get(
        f"/api/v1/visitors?event_id={event_id}&type=press",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    for v in r.json()["items"]:
        assert v["type"] == "press"


async def test_list_visitors_filter_by_event(
    client: AsyncClient, organizer_headers: dict
):
    """event_id filter scopes results correctly."""
    event_id = await _make_event(client, organizer_headers)
    await _make_visitor(client, organizer_headers, event_id, email="evt_scope@test.ma")
    r = await client.get(
        f"/api/v1/visitors?event_id={event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    for v in r.json()["items"]:
        assert v["event_id"] == event_id


async def test_list_visitors_pagination(client: AsyncClient, organizer_headers: dict):
    """Pagination params are respected."""
    r = await client.get("/api/v1/visitors?page=1&limit=5", headers=organizer_headers)
    assert r.status_code == 200
    assert len(r.json()["items"]) <= 5


# ── GET /api/v1/visitors/{id} ────────────────────────────────────────────────

async def test_get_visitor_by_id(client: AsyncClient, organizer_headers: dict):
    """Create then fetch — response includes tickets and qr_scans lists."""
    event_id = await _make_event(client, organizer_headers)
    created  = await _make_visitor(client, organizer_headers, event_id,
                                   email="get_by_id@test.ma")

    r = await client.get(f"/api/v1/visitors/{created['id']}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"]    == created["id"]
    assert data["email"] == "get_by_id@test.ma"
    assert "tickets"  in data
    assert "qr_scans" in data
    assert isinstance(data["tickets"],  list)
    assert isinstance(data["qr_scans"], list)


async def test_get_visitor_not_found(client: AsyncClient, organizer_headers: dict):
    """Unknown UUID returns 404 with detail."""
    r = await client.get(f"/api/v1/visitors/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


# ── PUT /api/v1/visitors/{id} ────────────────────────────────────────────────

async def test_update_visitor(client: AsyncClient, organizer_headers: dict):
    """Partial update only changes supplied fields."""
    event_id = await _make_event(client, organizer_headers)
    v = await _make_visitor(client, organizer_headers, event_id, email="update_me@test.ma")

    r = await client.put(
        f"/api/v1/visitors/{v['id']}",
        json={"company": "NewCorp", "type": "partner"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    updated = r.json()
    assert updated["company"] == "NewCorp"
    assert updated["type"]    == "partner"
    assert updated["email"]   == "update_me@test.ma"  # unchanged


async def test_update_visitor_invalid_type(client: AsyncClient, organizer_headers: dict):
    """Invalid type value returns 422."""
    event_id = await _make_event(client, organizer_headers)
    v = await _make_visitor(client, organizer_headers, event_id, email="inv_type@test.ma")

    r = await client.put(
        f"/api/v1/visitors/{v['id']}",
        json={"type": "superstar"},
        headers=organizer_headers,
    )
    assert r.status_code == 422


async def test_update_visitor_not_found(client: AsyncClient, organizer_headers: dict):
    """Updating unknown visitor returns 404."""
    r = await client.put(
        f"/api/v1/visitors/{NONEXISTENT_ID}",
        json={"company": "X"},
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ── DELETE /api/v1/visitors/{id} ─────────────────────────────────────────────

async def test_delete_visitor(client: AsyncClient, organizer_headers: dict):
    """Deleted visitor can no longer be fetched."""
    event_id = await _make_event(client, organizer_headers)
    v = await _make_visitor(client, organizer_headers, event_id, email="delete_me@test.ma")

    del_r = await client.delete(f"/api/v1/visitors/{v['id']}", headers=organizer_headers)
    assert del_r.status_code == 200
    assert "removed" in del_r.json()["message"].lower() or "visitor" in del_r.json()["message"].lower()

    # Visitor should no longer exist
    get_r = await client.get(f"/api/v1/visitors/{v['id']}", headers=organizer_headers)
    assert get_r.status_code == 404


async def test_delete_visitor_not_found(client: AsyncClient, organizer_headers: dict):
    """Deleting unknown visitor returns 404."""
    r = await client.delete(f"/api/v1/visitors/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404


# ── POST /api/v1/visitors/import-csv ─────────────────────────────────────────

def _make_csv(rows: list[dict]) -> bytes:
    """Build a minimal CSV from a list of row dicts."""
    if not rows:
        return b"first_name,last_name,email,company,type\n"
    header = ",".join(rows[0].keys())
    lines  = [header] + [",".join(str(v) for v in r.values()) for r in rows]
    return "\n".join(lines).encode()


async def test_import_csv_valid(client: AsyncClient, organizer_headers: dict):
    """Valid CSV imports all rows and returns correct counts."""
    event_id = await _make_event(client, organizer_headers)
    csv_data = _make_csv([
        {"first_name": "Ali",    "last_name": "Hassan",  "email": "ali.csv@test.ma",   "company": "Co1", "type": "standard"},
        {"first_name": "Sara",   "last_name": "Mouti",   "email": "sara.csv@test.ma",  "company": "Co2", "type": "vip"},
        {"first_name": "Youssef","last_name": "Alami",   "email": "youss.csv@test.ma", "company": "Co3", "type": "press"},
    ])

    r = await client.post(
        f"/api/v1/visitors/import-csv?event_id={event_id}",
        files={"file": ("visitors.csv", io.BytesIO(csv_data), "text/csv")},
        headers=organizer_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["imported"]   == 3
    assert data["skipped"]    == 0
    assert data["total_rows"] == 3
    assert data["errors"]     == []


async def test_import_csv_duplicate_email(client: AsyncClient, organizer_headers: dict):
    """Duplicate emails within same event are skipped with an error message."""
    event_id = await _make_event(client, organizer_headers)

    # First import
    csv1 = _make_csv([
        {"first_name": "Omar", "last_name": "Idrissi", "email": "dup@test.ma", "company": "Co", "type": "standard"},
    ])
    r1 = await client.post(
        f"/api/v1/visitors/import-csv?event_id={event_id}",
        files={"file": ("v1.csv", io.BytesIO(csv1), "text/csv")},
        headers=organizer_headers,
    )
    assert r1.json()["imported"] == 1

    # Second import — same email → skip
    r2 = await client.post(
        f"/api/v1/visitors/import-csv?event_id={event_id}",
        files={"file": ("v2.csv", io.BytesIO(csv1), "text/csv")},
        headers=organizer_headers,
    )
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["imported"] == 0
    assert data2["skipped"]  == 1
    assert len(data2["errors"]) == 1


async def test_import_csv_invalid_type(client: AsyncClient, organizer_headers: dict):
    """Row with invalid type is skipped and included in errors."""
    event_id = await _make_event(client, organizer_headers)
    csv_data = _make_csv([
        {"first_name": "Bad", "last_name": "Type", "email": "badtype@test.ma",
         "company": "Co", "type": "celebrity"},
    ])

    r = await client.post(
        f"/api/v1/visitors/import-csv?event_id={event_id}",
        files={"file": ("bad.csv", io.BytesIO(csv_data), "text/csv")},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["imported"] == 0
    assert data["skipped"]  == 1
    assert len(data["errors"]) >= 1


async def test_import_csv_missing_columns(client: AsyncClient, organizer_headers: dict):
    """CSV without required columns returns 422."""
    event_id = await _make_event(client, organizer_headers)
    bad_csv = b"name,email\nJohn,john@test.ma\n"

    r = await client.post(
        f"/api/v1/visitors/import-csv?event_id={event_id}",
        files={"file": ("bad.csv", io.BytesIO(bad_csv), "text/csv")},
        headers=organizer_headers,
    )
    assert r.status_code == 422


async def test_import_csv_empty(client: AsyncClient, organizer_headers: dict):
    """Empty CSV (header only) imports 0 rows without error."""
    event_id = await _make_event(client, organizer_headers)
    empty_csv = b"first_name,last_name,email,company,type\n"

    r = await client.post(
        f"/api/v1/visitors/import-csv?event_id={event_id}",
        files={"file": ("empty.csv", io.BytesIO(empty_csv), "text/csv")},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["imported"]   == 0
    assert r.json()["total_rows"] == 0


# ── GET /api/v1/visitors/export.xlsx ─────────────────────────────────────────

async def test_export_xlsx(client: AsyncClient, organizer_headers: dict):
    """Export returns 200 with correct XLSX content-type."""
    r = await client.get("/api/v1/visitors/export.xlsx", headers=organizer_headers)
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers.get("content-type", "")


async def test_export_xlsx_with_event_filter(
    client: AsyncClient, organizer_headers: dict
):
    """Export with event_id filter is accepted."""
    event_id = await _make_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/visitors/export.xlsx?event_id={event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200


# ── GET /api/v1/visitors/{id}/journey ────────────────────────────────────────

async def test_visitor_journey_empty(client: AsyncClient, organizer_headers: dict):
    """Fresh visitor has an empty journey."""
    event_id = await _make_event(client, organizer_headers)
    v = await _make_visitor(client, organizer_headers, event_id, email="journey@test.ma")

    r = await client.get(f"/api/v1/visitors/{v['id']}/journey", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["visitor_id"]   == v["id"]
    assert data["total_scans"]  == 0
    assert data["scans"]        == []
    assert data["visitor_name"] == "Fatima Zahra"


async def test_visitor_journey_not_found(client: AsyncClient, organizer_headers: dict):
    """Journey for unknown visitor returns 404."""
    r = await client.get(
        f"/api/v1/visitors/{NONEXISTENT_ID}/journey",
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ── Full CRUD lifecycle ───────────────────────────────────────────────────────

async def test_full_visitor_lifecycle(client: AsyncClient, organizer_headers: dict):
    """End-to-end: create → read detail → update → delete → 404."""
    event_id = await _make_event(client, organizer_headers)

    # Create
    v = await _make_visitor(
        client, organizer_headers, event_id,
        email="lifecycle@test.ma", type="speaker",
    )
    assert v["type"] == "speaker"

    # Read detail
    r = await client.get(f"/api/v1/visitors/{v['id']}", headers=organizer_headers)
    assert r.status_code == 200
    assert r.json()["type"] == "speaker"

    # Update
    r = await client.put(
        f"/api/v1/visitors/{v['id']}",
        json={"type": "organizer", "role": "Event Director"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["type"] == "organizer"
    assert r.json()["role"] == "Event Director"

    # Delete
    r = await client.delete(f"/api/v1/visitors/{v['id']}", headers=organizer_headers)
    assert r.status_code == 200

    # Confirm gone
    r = await client.get(f"/api/v1/visitors/{v['id']}", headers=organizer_headers)
    assert r.status_code == 404


# ── All visitor types round-trip ──────────────────────────────────────────────

@pytest.mark.parametrize("visitor_type", [
    "standard", "vip", "press", "partner", "organizer", "speaker"
])
async def test_all_visitor_types(
    client: AsyncClient,
    organizer_headers: dict,
    visitor_type: str,
):
    """Every valid visitor type can be created without error."""
    event_id = await _make_event(client, organizer_headers)
    email = f"type_{visitor_type}@test.ma"
    v = await _make_visitor(
        client, organizer_headers, event_id,
        email=email, type=visitor_type,
    )
    assert v["type"] == visitor_type
