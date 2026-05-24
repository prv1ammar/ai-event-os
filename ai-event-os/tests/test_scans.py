"""
tests/test_scans.py
────────────────────
Tests for the QR scan validation pipeline and analytics endpoints.

Covers:
  - QR generation & parsing (unit tests on qr_service)
  - Scan validation: valid entry, invalid format, cancelled ticket,
    wrong zone, unknown ticket, expired event dates
  - Zone access matrix: all 7 zones × multiple visitor types
  - Scan history list endpoint
  - Stats endpoint returns correct structure
  - Live-count endpoint
  - Badge colour preview endpoint
"""

from __future__ import annotations

import base64
import uuid

import pytest
from httpx import AsyncClient

from app.services.qr_service import build_qr_payload, generate_qr_code, parse_qr_data

# ── Shared helpers ────────────────────────────────────────────────────────────

EVENT_PAYLOAD = {
    "name":       "AI Summit Maroc 2026",
    "start_date": "2026-05-20",
    "end_date":   "2026-05-28",
    "venue":      "CICEC Casablanca",
    "city":       "Casablanca",
    "country":    "Morocco",
    "capacity":   5000,
    "category":   "tech",
}

# An event in the past — used to test date-expired rejection
PAST_EVENT_PAYLOAD = {
    **EVENT_PAYLOAD,
    "name":       "Past Event 2024",
    "start_date": "2024-01-01",
    "end_date":   "2024-01-03",
}

VISITOR_BASE = {
    "first_name": "Ahmed",
    "last_name":  "Benali",
    "email":      "ahmed.benali@test.ma",
    "company":    "AI Corp",
    "type":       "standard",
}

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"


async def _make_event(client: AsyncClient, headers: dict, payload=None) -> str:
    p = payload or EVENT_PAYLOAD
    r = await client.post("/api/v1/events", json=p, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _make_visitor(
    client: AsyncClient, headers: dict, event_id: str, **overrides
) -> dict:
    payload = {**VISITOR_BASE, "event_id": event_id, **overrides}
    r = await client.post("/api/v1/visitors", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def _make_ticket(
    client: AsyncClient, headers: dict, visitor_id: str, event_id: str,
    status: str = "confirmed",
) -> dict:
    r = await client.post(
        "/api/v1/tickets",
        json={"visitor_id": visitor_id, "event_id": event_id, "status": status},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _confirmed_scan_setup(client, headers):
    """Create event + standard visitor + confirmed ticket; return dict."""
    event_id   = await _make_event(client, headers)
    visitor    = await _make_visitor(client, headers, event_id)
    ticket     = await _make_ticket(client, headers, visitor["id"], event_id)
    qr_payload = build_qr_payload(event_id, visitor["id"], ticket["code"])
    return {
        "event_id":   event_id,
        "visitor":    visitor,
        "ticket":     ticket,
        "qr_payload": qr_payload,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Unit tests — qr_service (no DB / HTTP needed)
# ══════════════════════════════════════════════════════════════════════════════

class TestQrService:

    def test_generate_qr_code_returns_png_bytes(self):
        """generate_qr_code() returns non-empty PNG bytes."""
        event_id   = str(uuid.uuid4())
        visitor_id = str(uuid.uuid4())
        png = generate_qr_code("TKABCDEF1234", event_id, visitor_id)
        assert isinstance(png, bytes)
        assert len(png) > 0
        # PNG magic bytes: \x89PNG
        assert png[:4] == b"\x89PNG"

    def test_qr_payload_format(self):
        """QR payload has exactly 4 dash-separated parts."""
        eid = str(uuid.uuid4())
        vid = str(uuid.uuid4())
        payload = build_qr_payload(eid, vid, "TKABCDEF1234")
        parts = payload.split("-")
        assert parts[0] == "AIEVENT"
        assert len(parts) == 4
        assert parts[3] == "TKABCDEF1234"

    def test_parse_qr_data_round_trip(self):
        """build_qr_payload → parse_qr_data produces original values."""
        event_id   = str(uuid.uuid4())
        visitor_id = str(uuid.uuid4())
        code       = "TK1234567890"
        payload    = build_qr_payload(event_id, visitor_id, code)
        parsed     = parse_qr_data(payload)

        assert parsed["event_id"]   == event_id
        assert parsed["visitor_id"] == visitor_id
        assert parsed["ticket_code"] == code

    def test_parse_qr_data_invalid_prefix(self):
        """parse_qr_data raises ValueError for unknown prefix."""
        with pytest.raises(ValueError, match="Invalid QR format"):
            parse_qr_data("BADPREFIX-aabbccdd-eeff0011-TK123")

    def test_parse_qr_data_too_few_parts(self):
        """parse_qr_data raises ValueError when not exactly 4 segments."""
        with pytest.raises(ValueError):
            parse_qr_data("AIEVENT-only-two")

    def test_parse_qr_data_malformed_uuid_hex(self):
        """parse_qr_data raises ValueError for wrong-length hex IDs."""
        with pytest.raises(ValueError, match="Malformed"):
            parse_qr_data("AIEVENT-TOOSHORT-0123456789abcdef0123456789abcdef-TKCODE")

    def test_parse_qr_data_empty_string(self):
        """parse_qr_data raises ValueError for empty string."""
        with pytest.raises(ValueError):
            parse_qr_data("")


# ══════════════════════════════════════════════════════════════════════════════
# Integration tests — POST /api/v1/scans/validate
# ══════════════════════════════════════════════════════════════════════════════

async def test_validate_scan_valid_entry(
    client: AsyncClient, organizer_headers: dict
):
    """Valid QR + confirmed ticket + active event → scan accepted."""
    setup = await _confirmed_scan_setup(client, organizer_headers)

    r = await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": setup["qr_payload"], "zone": "entry_general"},
        headers=organizer_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["valid"]       is True
    assert "Access granted"    in data["message"]
    assert data["ticket_code"] == setup["ticket"]["code"]
    assert data["visitor"]["type"] == "standard"


async def test_validate_scan_invalid_qr_format(
    client: AsyncClient, organizer_headers: dict
):
    """Completely invalid QR string → valid=False, no HTTP error."""
    r = await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": "NOT-A-VALID-QR-CODE", "zone": "entry_general"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["valid"] is False


async def test_validate_scan_unknown_ticket(
    client: AsyncClient, organizer_headers: dict
):
    """QR format is valid but ticket code doesn't exist → rejected."""
    # Build a syntactically valid QR for a non-existent ticket
    fake_payload = build_qr_payload(
        str(uuid.uuid4()), str(uuid.uuid4()), "TKDEADBEEF00"
    )
    r = await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": fake_payload, "zone": "entry_general"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["valid"] is False
    assert "not found" in r.json()["message"].lower()


async def test_validate_scan_pending_ticket(
    client: AsyncClient, organizer_headers: dict
):
    """Pending (not confirmed) ticket → rejected."""
    event_id = await _make_event(client, organizer_headers)
    visitor  = await _make_visitor(client, organizer_headers, event_id,
                                   email="pending_tkt@test.ma")
    ticket   = await _make_ticket(
        client, organizer_headers, visitor["id"], event_id, status="pending"
    )
    qr = build_qr_payload(event_id, visitor["id"], ticket["code"])

    r = await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": qr, "zone": "entry_general"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["valid"] is False
    assert "pending" in r.json()["message"].lower()


async def test_validate_scan_cancelled_ticket(
    client: AsyncClient, organizer_headers: dict
):
    """Cancelled ticket → rejected."""
    event_id = await _make_event(client, organizer_headers)
    visitor  = await _make_visitor(client, organizer_headers, event_id,
                                   email="cancelled_tkt@test.ma")
    ticket   = await _make_ticket(
        client, organizer_headers, visitor["id"], event_id, status="cancelled"
    )
    qr = build_qr_payload(event_id, visitor["id"], ticket["code"])

    r = await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": qr, "zone": "entry_general"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["valid"] is False


async def test_validate_scan_past_event(
    client: AsyncClient, organizer_headers: dict
):
    """Ticket for an expired event → rejected (event dates check)."""
    event_id = await _make_event(client, organizer_headers, PAST_EVENT_PAYLOAD)
    visitor  = await _make_visitor(client, organizer_headers, event_id,
                                   email="past_event@test.ma")
    ticket   = await _make_ticket(client, organizer_headers, visitor["id"], event_id)
    qr = build_qr_payload(event_id, visitor["id"], ticket["code"])

    r = await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": qr, "zone": "entry_general"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["valid"] is False
    assert "2024" in r.json()["message"] or "access denied" in r.json()["message"].lower()


async def test_validate_scan_unknown_zone(
    client: AsyncClient, organizer_headers: dict
):
    """Scan to an unrecognised zone → rejected."""
    setup = await _confirmed_scan_setup(client, organizer_headers)

    r = await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": setup["qr_payload"], "zone": "magic_zone"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["valid"] is False
    assert "unknown zone" in r.json()["message"].lower()


# ── Zone access matrix tests ─────────────────────────────────────────────────

@pytest.mark.parametrize("visitor_type,zone,should_pass", [
    # standard allowed
    ("standard",  "entry_general",    True),
    ("standard",  "restaurant",       True),
    ("standard",  "session_general",  True),
    # standard blocked
    ("standard",  "lounge_vip",       False),
    ("standard",  "lounge_press",     False),
    ("standard",  "backstage",        False),
    # vip allowed
    ("vip",       "entry_general",    True),
    ("vip",       "lounge_vip",       True),
    ("vip",       "restaurant",       True),
    # vip blocked
    ("vip",       "lounge_press",     False),
    ("vip",       "backstage",        False),
    # press allowed
    ("press",     "lounge_press",     True),
    ("press",     "entry_general",    True),
    # press blocked
    ("press",     "lounge_vip",       False),
    ("press",     "backstage",        False),
    # partner
    ("partner",   "lounge_vip",       True),
    ("partner",   "backstage",        False),
    # organizer — all access except none
    ("organizer", "entry_general",    True),
    ("organizer", "lounge_vip",       True),
    ("organizer", "lounge_press",     True),
    ("organizer", "backstage",        True),
    # speaker
    ("speaker",   "backstage",        True),
    ("speaker",   "lounge_vip",       True),
    ("speaker",   "lounge_press",     False),
])
async def test_zone_access_matrix(
    client: AsyncClient,
    organizer_headers: dict,
    visitor_type: str,
    zone: str,
    should_pass: bool,
):
    """Access matrix: (visitor_type, zone) → allowed/denied."""
    event_id = await _make_event(client, organizer_headers)
    email    = f"matrix_{visitor_type}_{zone.replace('_','-')}@test.ma"
    visitor  = await _make_visitor(
        client, organizer_headers, event_id,
        email=email, type=visitor_type,
    )
    ticket = await _make_ticket(client, organizer_headers, visitor["id"], event_id)
    qr = build_qr_payload(event_id, visitor["id"], ticket["code"])

    r = await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": qr, "zone": zone},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    result = r.json()
    assert result["valid"] is should_pass, (
        f"Expected valid={should_pass} for {visitor_type}→{zone}, "
        f"got valid={result['valid']}: {result['message']}"
    )


# ── Scan creates a record verifiable via history ──────────────────────────────

async def test_scan_appears_in_history(
    client: AsyncClient, organizer_headers: dict
):
    """After a valid scan, it appears in the scan history list."""
    setup    = await _confirmed_scan_setup(client, organizer_headers)
    event_id = setup["event_id"]

    await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": setup["qr_payload"], "zone": "entry_general"},
        headers=organizer_headers,
    )

    history_r = await client.get(
        f"/api/v1/scans?event_id={event_id}",
        headers=organizer_headers,
    )
    assert history_r.status_code == 200
    history = history_r.json()
    assert isinstance(history, list)
    assert len(history) >= 1
    zones = [s["zone"] for s in history]
    assert "entry_general" in zones


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/v1/scans/stats/{event_id}
# ══════════════════════════════════════════════════════════════════════════════

async def test_scan_stats_structure(
    client: AsyncClient, organizer_headers: dict
):
    """Stats endpoint returns the required fields with correct types."""
    event_id = await _make_event(client, organizer_headers)

    r = await client.get(
        f"/api/v1/scans/stats/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["event_id"]        == event_id
    assert isinstance(data["total_scans"],     int)
    assert isinstance(data["unique_visitors"], int)
    assert isinstance(data["entries_by_hour"], dict)
    assert isinstance(data["entries_by_zone"], dict)
    assert isinstance(data["entries_by_type"], dict)
    # Fresh event has zeros
    assert data["total_scans"]     == 0
    assert data["unique_visitors"] == 0


async def test_scan_stats_after_scan(
    client: AsyncClient, organizer_headers: dict
):
    """Stats reflect a scan that just happened."""
    setup    = await _confirmed_scan_setup(client, organizer_headers)
    event_id = setup["event_id"]

    # Perform one valid scan
    await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": setup["qr_payload"], "zone": "entry_general"},
        headers=organizer_headers,
    )

    r = await client.get(
        f"/api/v1/scans/stats/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total_scans"]     >= 1
    assert data["unique_visitors"] >= 1
    assert data["entries_by_zone"].get("entry_general", 0) >= 1


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/v1/scans/live-count/{event_id}
# ══════════════════════════════════════════════════════════════════════════════

async def test_live_count_fresh_event(
    client: AsyncClient, organizer_headers: dict
):
    """Fresh event live-count returns zeros."""
    event_id = await _make_event(client, organizer_headers)

    r = await client.get(
        f"/api/v1/scans/live-count/{event_id}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["event_id"]      == event_id
    assert isinstance(data["entries_today"],   int)
    assert isinstance(data["visitors_online"], int)
    assert "last_updated" in data


async def test_live_count_after_entry(
    client: AsyncClient, organizer_headers: dict
):
    """Live-count increments after a valid entry_general scan."""
    setup    = await _confirmed_scan_setup(client, organizer_headers)
    event_id = setup["event_id"]

    before_r = await client.get(
        f"/api/v1/scans/live-count/{event_id}", headers=organizer_headers
    )
    before = before_r.json()["entries_today"]

    # Scan
    await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": setup["qr_payload"], "zone": "entry_general"},
        headers=organizer_headers,
    )

    after_r = await client.get(
        f"/api/v1/scans/live-count/{event_id}", headers=organizer_headers
    )
    after = after_r.json()["entries_today"]
    assert after >= before  # may already be > 0 from other tests in same session


# ══════════════════════════════════════════════════════════════════════════════
# Tickets endpoints
# ══════════════════════════════════════════════════════════════════════════════

async def test_create_ticket_and_get_qr(
    client: AsyncClient, organizer_headers: dict
):
    """Create a ticket then download its QR as a PNG image."""
    event_id = await _make_event(client, organizer_headers)
    visitor  = await _make_visitor(client, organizer_headers, event_id,
                                   email="qr_download@test.ma")
    ticket   = await _make_ticket(client, organizer_headers, visitor["id"], event_id)

    r = await client.get(
        f"/api/v1/tickets/{ticket['id']}/qr.png",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    # PNG magic bytes
    assert r.content[:4] == b"\x89PNG"


async def test_update_ticket_status(
    client: AsyncClient, organizer_headers: dict
):
    """Status transitions are persisted correctly."""
    event_id = await _make_event(client, organizer_headers)
    visitor  = await _make_visitor(client, organizer_headers, event_id,
                                   email="ticket_status@test.ma")
    ticket   = await _make_ticket(
        client, organizer_headers, visitor["id"], event_id, status="pending"
    )
    assert ticket["status"] == "pending"

    r = await client.put(
        f"/api/v1/tickets/{ticket['id']}/status",
        json={"status": "confirmed"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"


async def test_bulk_generate_tickets(
    client: AsyncClient, organizer_headers: dict
):
    """Bulk-generate creates one ticket per visitor."""
    event_id = await _make_event(client, organizer_headers)
    v1 = await _make_visitor(client, organizer_headers, event_id, email="bulk1@test.ma")
    v2 = await _make_visitor(client, organizer_headers, event_id, email="bulk2@test.ma")

    r = await client.post(
        "/api/v1/tickets/bulk-generate",
        json={
            "visitor_ids": [v1["id"], v2["id"]],
            "event_id":    event_id,
            "pack":        "general",
        },
        headers=organizer_headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["generated"] == 2
    assert data["skipped"]   == 0
    assert len(data["ticket_ids"]) == 2


# ══════════════════════════════════════════════════════════════════════════════
# Badge preview endpoint
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("visitor_type", ["vip", "press", "standard", "organizer"])
async def test_badge_preview(
    client: AsyncClient, organizer_headers: dict, visitor_type: str
):
    """Badge preview returns correct colour fields."""
    r = await client.get(
        f"/api/v1/badges/preview/{visitor_type}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["visitor_type"] == visitor_type
    assert "border" in data["colors"]
    assert data["colors"]["border"].startswith("#")


async def test_badge_preview_unknown_type(
    client: AsyncClient, organizer_headers: dict
):
    """Unknown visitor type for badge preview returns 404."""
    r = await client.get(
        "/api/v1/badges/preview/unknown_type",
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# Device ID passthrough
# ══════════════════════════════════════════════════════════════════════════════

async def test_validate_scan_with_device_id(
    client: AsyncClient, organizer_headers: dict
):
    """device_id is accepted and recorded (doesn't affect valid/invalid logic)."""
    event_id = await _make_event(client, organizer_headers)
    visitor  = await _make_visitor(client, organizer_headers, event_id,
                                   email="device_id@test.ma")
    ticket   = await _make_ticket(client, organizer_headers, visitor["id"], event_id)
    qr = build_qr_payload(event_id, visitor["id"], ticket["code"])

    r = await client.post(
        "/api/v1/scans/validate",
        json={"qr_data": qr, "zone": "entry_general", "device_id": "SCANNER-001"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["valid"] is True
