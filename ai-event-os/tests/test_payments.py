"""
tests/test_payments.py
──────────────────────
Comprehensive tests for the /api/v1/payments endpoints.

Covers:
  - CRUD lifecycle (create → read → update status → refund)
  - Listing with filters (event_id, status, method, payer_type, source)
  - Payment history by payer_id
  - Duplicate reference guard (409)
  - Refund validations (only paid/partial can be refunded)
  - Authorization (organizer can create; visitor cannot)
  - Pagination
  - 404 for unknown IDs
"""

import uuid

import pytest
from httpx import AsyncClient

# ── Shared fixtures / constants ────────────────────────────────────────────────

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"

EVENT_BASE = {
    "name": "Finance Test Event",
    "start_date": "2026-09-01",
    "end_date": "2026-09-03",
    "venue": "Foire de Casablanca",
    "city": "Casablanca",
    "country": "Morocco",
    "capacity": 3000,
    "category": "salon",
    "budget_mad": 1_000_000,
}

PAYER_ID = str(uuid.uuid4())


async def _create_event(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/events", json=EVENT_BASE, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_payment(
    client: AsyncClient,
    headers: dict,
    event_id: str,
    amount: int = 50_000,
    source: str = "stands",
    reference: str | None = None,
) -> dict:
    payload = {
        "amount_mad": amount,
        "method": "transfer",
        "source": source,
        "payer_type": "exhibitor",
        "payer_id": PAYER_ID,
        "event_id": event_id,
    }
    if reference:
        payload["reference"] = reference
    r = await client.post("/api/v1/payments", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── POST /api/v1/payments ──────────────────────────────────────────────────────

async def test_create_payment_organizer(client: AsyncClient, organizer_headers: dict):
    """Organizer can create a payment; initial status is pending."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id)

    assert payment["status"] == "pending"
    assert payment["amount_mad"] == 50_000
    assert payment["source"] == "stands"
    assert payment["method"] == "transfer"
    assert payment["payer_type"] == "exhibitor"
    assert "id" in payment
    assert "created_at" in payment
    assert "updated_at" in payment
    assert payment["paid_at"] is None


async def test_create_payment_visitor_forbidden(client: AsyncClient, visitor_headers: dict, organizer_headers: dict):
    """Visitor role cannot create a payment (403)."""
    event_id = await _create_event(client, organizer_headers)
    payload = {
        "amount_mad": 10_000,
        "method": "card",
        "source": "inscriptions",
        "payer_type": "visitor",
        "payer_id": PAYER_ID,
        "event_id": event_id,
    }
    r = await client.post("/api/v1/payments", json=payload, headers=visitor_headers)
    assert r.status_code == 403


async def test_create_payment_unauthenticated(client: AsyncClient, organizer_headers: dict):
    """Unauthenticated request returns 401."""
    event_id = await _create_event(client, organizer_headers)
    payload = {
        "amount_mad": 10_000,
        "method": "card",
        "source": "inscriptions",
        "payer_type": "visitor",
        "payer_id": PAYER_ID,
        "event_id": event_id,
    }
    r = await client.post("/api/v1/payments", json=payload)
    assert r.status_code == 401


async def test_create_payment_invalid_method(client: AsyncClient, organizer_headers: dict):
    """Invalid method returns 422."""
    event_id = await _create_event(client, organizer_headers)
    payload = {
        "amount_mad": 5_000,
        "method": "bitcoin",  # invalid
        "source": "other",
        "payer_type": "exhibitor",
        "payer_id": PAYER_ID,
        "event_id": event_id,
    }
    r = await client.post("/api/v1/payments", json=payload, headers=organizer_headers)
    assert r.status_code == 422


async def test_create_payment_invalid_source(client: AsyncClient, organizer_headers: dict):
    """Invalid source returns 422."""
    event_id = await _create_event(client, organizer_headers)
    payload = {
        "amount_mad": 5_000,
        "method": "card",
        "source": "crypto",  # invalid
        "payer_type": "exhibitor",
        "payer_id": PAYER_ID,
        "event_id": event_id,
    }
    r = await client.post("/api/v1/payments", json=payload, headers=organizer_headers)
    assert r.status_code == 422


async def test_create_payment_zero_amount(client: AsyncClient, organizer_headers: dict):
    """Zero or negative amount returns 422."""
    event_id = await _create_event(client, organizer_headers)
    payload = {
        "amount_mad": 0,
        "method": "card",
        "source": "other",
        "payer_type": "visitor",
        "payer_id": PAYER_ID,
        "event_id": event_id,
    }
    r = await client.post("/api/v1/payments", json=payload, headers=organizer_headers)
    assert r.status_code == 422


async def test_create_payment_duplicate_reference(client: AsyncClient, organizer_headers: dict):
    """Duplicate bank reference returns 409."""
    event_id = await _create_event(client, organizer_headers)
    ref = f"REF-UNIQUE-{uuid.uuid4().hex[:8]}"
    await _create_payment(client, organizer_headers, event_id, reference=ref)

    payload = {
        "amount_mad": 20_000,
        "method": "transfer",
        "source": "sponsoring",
        "payer_type": "exhibitor",
        "payer_id": PAYER_ID,
        "event_id": event_id,
        "reference": ref,
    }
    r = await client.post("/api/v1/payments", json=payload, headers=organizer_headers)
    assert r.status_code == 409


async def test_create_payment_all_sources(client: AsyncClient, organizer_headers: dict):
    """All valid sources are accepted."""
    event_id = await _create_event(client, organizer_headers)
    for source in ("stands", "sponsoring", "partenaires", "inscriptions", "other"):
        payload = {
            "amount_mad": 1_000,
            "method": "cash",
            "source": source,
            "payer_type": "visitor",
            "payer_id": PAYER_ID,
            "event_id": event_id,
        }
        r = await client.post("/api/v1/payments", json=payload, headers=organizer_headers)
        assert r.status_code == 201, f"source={source} failed: {r.text}"
        assert r.json()["source"] == source


async def test_create_payment_all_methods(client: AsyncClient, organizer_headers: dict):
    """All valid payment methods are accepted."""
    event_id = await _create_event(client, organizer_headers)
    for method in ("transfer", "card", "cash", "cmi", "cheque"):
        payload = {
            "amount_mad": 2_000,
            "method": method,
            "source": "other",
            "payer_type": "exhibitor",
            "payer_id": PAYER_ID,
            "event_id": event_id,
        }
        r = await client.post("/api/v1/payments", json=payload, headers=organizer_headers)
        assert r.status_code == 201, f"method={method} failed: {r.text}"
        assert r.json()["method"] == method


# ── GET /api/v1/payments ───────────────────────────────────────────────────────

async def test_list_payments_empty(client: AsyncClient, organizer_headers: dict):
    """List returns an array (possibly empty)."""
    r = await client.get("/api/v1/payments", headers=organizer_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_payments_filter_by_event(client: AsyncClient, organizer_headers: dict):
    """event_id filter returns only payments for that event."""
    event_id = await _create_event(client, organizer_headers)
    await _create_payment(client, organizer_headers, event_id)

    r = await client.get(f"/api/v1/payments?event_id={event_id}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    for p in data:
        assert p["event_id"] == event_id


async def test_list_payments_filter_by_status(client: AsyncClient, organizer_headers: dict):
    """status filter only returns matching payments."""
    event_id = await _create_event(client, organizer_headers)
    await _create_payment(client, organizer_headers, event_id)  # status=pending

    r = await client.get("/api/v1/payments?status=pending", headers=organizer_headers)
    assert r.status_code == 200
    for p in r.json():
        assert p["status"] == "pending"


async def test_list_payments_filter_by_source(client: AsyncClient, organizer_headers: dict):
    """source filter returns only matching payments."""
    event_id = await _create_event(client, organizer_headers)
    await _create_payment(client, organizer_headers, event_id, source="sponsoring")

    r = await client.get("/api/v1/payments?source=sponsoring", headers=organizer_headers)
    assert r.status_code == 200
    for p in r.json():
        assert p["source"] == "sponsoring"


async def test_list_payments_pagination(client: AsyncClient, organizer_headers: dict):
    """Pagination parameters are respected."""
    r = await client.get("/api/v1/payments?page=1&limit=5", headers=organizer_headers)
    assert r.status_code == 200
    assert len(r.json()) <= 5


# ── GET /api/v1/payments/{id} ─────────────────────────────────────────────────

async def test_get_payment_by_id(client: AsyncClient, organizer_headers: dict):
    """Get payment by ID returns full detail."""
    event_id = await _create_event(client, organizer_headers)
    created = await _create_payment(client, organizer_headers, event_id)
    payment_id = created["id"]

    r = await client.get(f"/api/v1/payments/{payment_id}", headers=organizer_headers)
    assert r.status_code == 200
    assert r.json()["id"] == payment_id
    assert r.json()["amount_mad"] == 50_000


async def test_get_payment_not_found(client: AsyncClient, organizer_headers: dict):
    """Unknown UUID returns 404."""
    r = await client.get(f"/api/v1/payments/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


# ── PUT /api/v1/payments/{id}/status ──────────────────────────────────────────

async def test_update_payment_status_to_paid(client: AsyncClient, organizer_headers: dict):
    """Updating status to 'paid' stamps paid_at."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id)
    payment_id = payment["id"]

    r = await client.put(
        f"/api/v1/payments/{payment_id}/status",
        json={"status": "paid"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "paid"
    assert data["paid_at"] is not None


async def test_update_payment_status_to_failed(client: AsyncClient, organizer_headers: dict):
    """Status can be set to 'failed'."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id)

    r = await client.put(
        f"/api/v1/payments/{payment['id']}/status",
        json={"status": "failed"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "failed"


async def test_update_payment_status_invalid(client: AsyncClient, organizer_headers: dict):
    """Invalid status value returns 422."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id)

    r = await client.put(
        f"/api/v1/payments/{payment['id']}/status",
        json={"status": "processed"},  # invalid
        headers=organizer_headers,
    )
    assert r.status_code == 422


async def test_update_payment_status_not_found(client: AsyncClient, organizer_headers: dict):
    """Updating unknown payment returns 404."""
    r = await client.put(
        f"/api/v1/payments/{NONEXISTENT_ID}/status",
        json={"status": "paid"},
        headers=organizer_headers,
    )
    assert r.status_code == 404


async def test_update_payment_status_visitor_forbidden(
    client: AsyncClient, organizer_headers: dict, visitor_headers: dict
):
    """Visitor cannot update payment status (403)."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id)

    r = await client.put(
        f"/api/v1/payments/{payment['id']}/status",
        json={"status": "paid"},
        headers=visitor_headers,
    )
    assert r.status_code == 403


# ── POST /api/v1/payments/{id}/refund ─────────────────────────────────────────

async def test_full_refund(client: AsyncClient, organizer_headers: dict):
    """Full refund on a paid payment sets status to 'refunded'."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=30_000)
    pid = payment["id"]

    # Pay first
    await client.put(f"/api/v1/payments/{pid}/status", json={"status": "paid"}, headers=organizer_headers)

    # Refund
    r = await client.post(
        f"/api/v1/payments/{pid}/refund",
        json={"reason": "Client cancellation"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "refunded"
    assert "Refund" in data["notes"]


async def test_partial_refund(client: AsyncClient, organizer_headers: dict):
    """Partial refund on a paid payment sets status to 'partial'."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=40_000)
    pid = payment["id"]

    await client.put(f"/api/v1/payments/{pid}/status", json={"status": "paid"}, headers=organizer_headers)

    r = await client.post(
        f"/api/v1/payments/{pid}/refund",
        json={"amount_mad": 10_000},  # partial
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "partial"


async def test_refund_pending_payment_fails(client: AsyncClient, organizer_headers: dict):
    """Cannot refund a pending payment (400)."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id)

    r = await client.post(
        f"/api/v1/payments/{payment['id']}/refund",
        json={},
        headers=organizer_headers,
    )
    assert r.status_code == 400
    assert "cannot refund" in r.json()["detail"].lower()


async def test_refund_not_found(client: AsyncClient, organizer_headers: dict):
    """Refunding unknown payment returns 404."""
    r = await client.post(
        f"/api/v1/payments/{NONEXISTENT_ID}/refund",
        json={},
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ── GET /api/v1/payments/history/{payer_id} ───────────────────────────────────

async def test_payment_history(client: AsyncClient, organizer_headers: dict):
    """History endpoint returns payments for the given payer_id."""
    event_id = await _create_event(client, organizer_headers)
    payer = str(uuid.uuid4())

    # Create two payments for the same payer
    for amount in (15_000, 25_000):
        payload = {
            "amount_mad": amount,
            "method": "card",
            "source": "inscriptions",
            "payer_type": "visitor",
            "payer_id": payer,
            "event_id": event_id,
        }
        r = await client.post("/api/v1/payments", json=payload, headers=organizer_headers)
        assert r.status_code == 201

    r = await client.get(f"/api/v1/payments/history/{payer}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 2
    for p in data:
        assert p["payer_id"] == payer


async def test_payment_history_empty(client: AsyncClient, organizer_headers: dict):
    """History for unknown payer returns empty list (not 404)."""
    random_payer = str(uuid.uuid4())
    r = await client.get(f"/api/v1/payments/history/{random_payer}", headers=organizer_headers)
    assert r.status_code == 200
    assert r.json() == []


async def test_payment_history_unauthenticated(client: AsyncClient):
    """Unauthenticated request returns 401."""
    r = await client.get(f"/api/v1/payments/history/{NONEXISTENT_ID}")
    assert r.status_code == 401


# ── Full payment lifecycle ─────────────────────────────────────────────────────

async def test_full_payment_lifecycle(client: AsyncClient, organizer_headers: dict):
    """End-to-end: create → pay → refund → verify history."""
    event_id = await _create_event(client, organizer_headers)
    payer_id = str(uuid.uuid4())

    # 1. Create
    ref = f"VIREMENT-{uuid.uuid4().hex[:8].upper()}"
    payload = {
        "amount_mad": 120_000,
        "method": "transfer",
        "source": "stands",
        "payer_type": "exhibitor",
        "payer_id": payer_id,
        "event_id": event_id,
        "reference": ref,
        "notes": "Stand A12 — Zone Premium",
    }
    r = await client.post("/api/v1/payments", json=payload, headers=organizer_headers)
    assert r.status_code == 201
    pid = r.json()["id"]
    assert r.json()["status"] == "pending"
    assert r.json()["notes"] == "Stand A12 — Zone Premium"

    # 2. Pay
    r = await client.put(f"/api/v1/payments/{pid}/status", json={"status": "paid"}, headers=organizer_headers)
    assert r.json()["status"] == "paid"
    assert r.json()["paid_at"] is not None

    # 3. Verify in history
    r = await client.get(f"/api/v1/payments/history/{payer_id}", headers=organizer_headers)
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert pid in ids

    # 4. Refund
    r = await client.post(
        f"/api/v1/payments/{pid}/refund",
        json={"reason": "Stand size mismatch"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "refunded"

    # 5. Fetch and confirm
    r = await client.get(f"/api/v1/payments/{pid}", headers=organizer_headers)
    assert r.json()["status"] == "refunded"
    assert "Stand size mismatch" in r.json()["notes"]
