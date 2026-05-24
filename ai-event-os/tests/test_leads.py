"""
tests/test_leads.py
─────────────────────
Comprehensive tests for the lead pipeline and B2B meetings module.

Covers:
  POST /api/v1/leads                     create lead
  GET  /api/v1/leads                     list with filters
  GET  /api/v1/leads/{id}                detail with visitor/exhibitor
  PUT  /api/v1/leads/{id}                update notes/score/budget
  PUT  /api/v1/leads/{id}/status         status transition
  DELETE /api/v1/leads/{id}              delete (organizer only)
  GET  /api/v1/leads/export.xlsx         Excel download
  GET  /api/v1/leads/stats/{event_id}    funnel stats
  POST /api/v1/leads/{id}/schedule-meeting  B2B meeting from lead

  POST /api/v1/meetings                  create meeting directly
  GET  /api/v1/meetings                  list meetings
  GET  /api/v1/meetings/{id}             meeting detail
  PUT  /api/v1/meetings/{id}/status      confirm / cancel
  GET  /api/v1/meetings/calendar/{eid}   calendar view
"""

import pytest
from httpx import AsyncClient

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"

# ── Fixtures / helpers ─────────────────────────────────────────────────────────

EVENT_PAYLOAD = {
    "name": "Salon Tech Maroc 2026",
    "start_date": "2026-09-10",
    "end_date": "2026-09-12",
    "venue": "OFEC",
    "city": "Casablanca",
    "capacity": 3000,
    "category": "tech",
}

VISITOR_PAYLOAD = {
    "first_name": "Youssef",
    "last_name": "El Mansouri",
    "email": "youssef.elmansouri@leads-test.ma",
    "phone": "+212661234567",
    "company": "InnoTech SARL",
    "role": "Directeur Commercial",
}

EXHIBITOR_PAYLOAD = {
    "company_name": "DataPulse Maroc",
    "sector": "IA & Data",
    "contact_name": "Aicha Bensouda",
    "contact_email": "aicha.bensouda@datapulse.ma",
    "package": "gold",
}


async def _create_event(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/events", json=EVENT_PAYLOAD, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_visitor(client: AsyncClient, headers: dict, event_id: str) -> str:
    payload = {**VISITOR_PAYLOAD, "event_id": event_id}
    r = await client.post("/api/v1/visitors", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_exhibitor(client: AsyncClient, headers: dict, event_id: str) -> str:
    payload = {**EXHIBITOR_PAYLOAD, "event_id": event_id}
    r = await client.post("/api/v1/exhibitors", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_lead(
    client: AsyncClient,
    headers: dict,
    event_id: str,
    visitor_id: str,
    exhibitor_id: str,
    **extra,
) -> str:
    payload = {
        "visitor_id": visitor_id,
        "exhibitor_id": exhibitor_id,
        "event_id": event_id,
        "notes": "Très intéressé par le produit X",
        "budget_range": "100k-500k MAD",
        **extra,
    }
    r = await client.post("/api/v1/leads", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── POST /api/v1/leads ────────────────────────────────────────────────────────

async def test_create_lead_success(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)

    payload = {
        "visitor_id": vid,
        "exhibitor_id": xid,
        "event_id": eid,
        "budget_range": "100k-500k MAD",
        "notes": "Test note",
    }
    r = await client.post("/api/v1/leads", json=payload, headers=organizer_headers)
    assert r.status_code == 201, r.text
    data = r.json()
    assert "id" in data
    assert data["visitor_id"] == vid
    assert data["exhibitor_id"] == xid
    assert data["event_id"] == eid
    assert data["status"] in ("new", "contacted", "qualified", "opportunity")
    assert data["score"] is not None and 0 <= data["score"] <= 100
    assert "created_at" in data
    assert "updated_at" in data


async def test_create_lead_unauthenticated(client: AsyncClient):
    r = await client.post("/api/v1/leads", json={})
    assert r.status_code == 401


async def test_create_lead_invalid_status(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)

    r = await client.post("/api/v1/leads", json={
        "visitor_id": vid, "exhibitor_id": xid, "event_id": eid,
        "status": "invalid_status",
    }, headers=organizer_headers)
    assert r.status_code == 422


async def test_create_lead_nonexistent_event(client: AsyncClient, organizer_headers: dict):
    r = await client.post("/api/v1/leads", json={
        "visitor_id": NONEXISTENT_ID,
        "exhibitor_id": NONEXISTENT_ID,
        "event_id": NONEXISTENT_ID,
    }, headers=organizer_headers)
    assert r.status_code == 404


# ── GET /api/v1/leads ─────────────────────────────────────────────────────────

async def test_list_leads(client: AsyncClient, organizer_headers: dict):
    r = await client.get("/api/v1/leads", headers=organizer_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_leads_filter_by_event(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.get(f"/api/v1/leads?event_id={eid}", headers=organizer_headers)
    assert r.status_code == 200
    for lead in r.json():
        assert lead["event_id"] == eid


async def test_list_leads_filter_by_status(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.get("/api/v1/leads?status=new", headers=organizer_headers)
    assert r.status_code == 200
    for lead in r.json():
        assert lead["status"] == "new"


async def test_list_leads_pagination(client: AsyncClient, organizer_headers: dict):
    r = await client.get("/api/v1/leads?page=1&limit=5", headers=organizer_headers)
    assert r.status_code == 200
    assert len(r.json()) <= 5


# ── GET /api/v1/leads/{id} ────────────────────────────────────────────────────

async def test_get_lead_by_id(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    lid = await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.get(f"/api/v1/leads/{lid}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == lid
    # Visitor and exhibitor info should be embedded
    assert data["visitor"]["id"] == vid
    assert data["exhibitor"]["id"] == xid


async def test_get_lead_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/leads/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


# ── PUT /api/v1/leads/{id} ────────────────────────────────────────────────────

async def test_update_lead_notes(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    lid = await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.put(f"/api/v1/leads/{lid}", json={"notes": "Updated note"}, headers=organizer_headers)
    assert r.status_code == 200
    assert r.json()["notes"] == "Updated note"


async def test_update_lead_score(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    lid = await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.put(f"/api/v1/leads/{lid}", json={"score": 85}, headers=organizer_headers)
    assert r.status_code == 200
    assert r.json()["score"] == 85


async def test_update_lead_score_invalid(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    lid = await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.put(f"/api/v1/leads/{lid}", json={"score": 150}, headers=organizer_headers)
    assert r.status_code == 422


# ── PUT /api/v1/leads/{id}/status ────────────────────────────────────────────

async def test_update_lead_status(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    lid = await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.put(
        f"/api/v1/leads/{lid}/status",
        json={"status": "qualified"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "qualified"


async def test_update_lead_status_invalid(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    lid = await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.put(
        f"/api/v1/leads/{lid}/status",
        json={"status": "invalid"},
        headers=organizer_headers,
    )
    assert r.status_code == 422


async def test_full_lead_status_pipeline(client: AsyncClient, organizer_headers: dict):
    """Test: new → contacted → qualified → opportunity → closed_won."""
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    lid = await _create_lead(client, organizer_headers, eid, vid, xid)

    for next_status in ["contacted", "qualified", "opportunity", "closed_won"]:
        r = await client.put(
            f"/api/v1/leads/{lid}/status",
            json={"status": next_status},
            headers=organizer_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == next_status


# ── DELETE /api/v1/leads/{id} ─────────────────────────────────────────────────

async def test_delete_lead(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    lid = await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.delete(f"/api/v1/leads/{lid}", headers=organizer_headers)
    assert r.status_code == 200
    assert "deleted" in r.json()["message"].lower()

    # Gone after deletion
    r2 = await client.get(f"/api/v1/leads/{lid}", headers=organizer_headers)
    assert r2.status_code == 404


async def test_delete_lead_visitor_forbidden(client: AsyncClient, visitor_headers: dict, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    lid = await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.delete(f"/api/v1/leads/{lid}", headers=visitor_headers)
    assert r.status_code == 403


# ── GET /api/v1/leads/export.xlsx ────────────────────────────────────────────

async def test_export_leads_excel(client: AsyncClient, organizer_headers: dict):
    r = await client.get("/api/v1/leads/export.xlsx", headers=organizer_headers)
    assert r.status_code == 200
    assert "spreadsheet" in r.headers.get("content-type", "")
    assert r.headers.get("content-disposition", "").startswith("attachment")
    # Excel files start with PK (ZIP header)
    assert r.content[:2] == b"PK"


async def test_export_leads_excel_with_filter(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.get(
        f"/api/v1/leads/export.xlsx?event_id={eid}",
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.content[:2] == b"PK"


# ── GET /api/v1/leads/stats/{event_id} ────────────────────────────────────────

async def test_lead_funnel_stats(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.get(f"/api/v1/leads/stats/{eid}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()

    assert data["event_id"] == eid
    assert isinstance(data["total"], int)
    assert isinstance(data["by_status"], dict)
    assert isinstance(data["avg_score"], float)
    assert isinstance(data["top_leads"], int)
    assert data["total"] >= 1


async def test_lead_funnel_stats_empty_event(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    r = await client.get(f"/api/v1/leads/stats/{eid}", headers=organizer_headers)
    assert r.status_code == 200
    assert r.json()["total"] == 0
    assert r.json()["avg_score"] == 0.0


async def test_lead_funnel_stats_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/leads/stats/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404


# ── POST /api/v1/leads/{id}/schedule-meeting ──────────────────────────────────

async def test_schedule_meeting_from_lead(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)
    lid = await _create_lead(client, organizer_headers, eid, vid, xid)

    r = await client.post(
        f"/api/v1/leads/{lid}/schedule-meeting",
        json={
            "scheduled_at": "2026-09-11T10:00:00Z",
            "duration_min": 45,
            "notes": "Présentation du produit Y",
        },
        headers=organizer_headers,
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["visitor_id"] == vid
    assert data["exhibitor_id"] == xid
    assert data["status"] == "pending"
    assert data["duration_min"] == 45


async def test_schedule_meeting_from_lead_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.post(
        f"/api/v1/leads/{NONEXISTENT_ID}/schedule-meeting",
        json={"scheduled_at": "2026-09-11T10:00:00Z"},
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# Meeting tests
# ══════════════════════════════════════════════════════════════════════════════

# ── POST /api/v1/meetings ─────────────────────────────────────────────────────

async def test_create_meeting_direct(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)

    r = await client.post("/api/v1/meetings", json={
        "visitor_id": vid,
        "exhibitor_id": xid,
        "event_id": eid,
        "scheduled_at": "2026-09-11T14:00:00Z",
        "duration_min": 30,
        "notes": "Demo session",
    }, headers=organizer_headers)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["status"] == "pending"
    assert data["visitor"]["id"] == vid
    assert data["exhibitor"]["id"] == xid


async def test_create_meeting_unauthenticated(client: AsyncClient):
    r = await client.post("/api/v1/meetings", json={})
    assert r.status_code == 401


async def test_create_meeting_invalid_fk(client: AsyncClient, organizer_headers: dict):
    r = await client.post("/api/v1/meetings", json={
        "visitor_id": NONEXISTENT_ID,
        "exhibitor_id": NONEXISTENT_ID,
        "event_id": NONEXISTENT_ID,
        "scheduled_at": "2026-09-11T14:00:00Z",
    }, headers=organizer_headers)
    assert r.status_code == 404


# ── GET /api/v1/meetings ──────────────────────────────────────────────────────

async def test_list_meetings(client: AsyncClient, organizer_headers: dict):
    r = await client.get("/api/v1/meetings", headers=organizer_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_meetings_filter_by_event(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)

    await client.post("/api/v1/meetings", json={
        "visitor_id": vid, "exhibitor_id": xid, "event_id": eid,
        "scheduled_at": "2026-09-11T14:00:00Z",
    }, headers=organizer_headers)

    r = await client.get(f"/api/v1/meetings?event_id={eid}", headers=organizer_headers)
    assert r.status_code == 200
    for m in r.json():
        assert m["event_id"] == eid


# ── GET /api/v1/meetings/{id} ─────────────────────────────────────────────────

async def test_get_meeting_by_id(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)

    create_r = await client.post("/api/v1/meetings", json={
        "visitor_id": vid, "exhibitor_id": xid, "event_id": eid,
        "scheduled_at": "2026-09-11T14:00:00Z",
    }, headers=organizer_headers)
    mid = create_r.json()["id"]

    r = await client.get(f"/api/v1/meetings/{mid}", headers=organizer_headers)
    assert r.status_code == 200
    assert r.json()["id"] == mid


async def test_get_meeting_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/meetings/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404


# ── PUT /api/v1/meetings/{id}/status ─────────────────────────────────────────

async def test_confirm_meeting(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)

    create_r = await client.post("/api/v1/meetings", json={
        "visitor_id": vid, "exhibitor_id": xid, "event_id": eid,
        "scheduled_at": "2026-09-11T14:00:00Z",
    }, headers=organizer_headers)
    mid = create_r.json()["id"]

    r = await client.put(
        f"/api/v1/meetings/{mid}/status",
        json={"status": "confirmed"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"


async def test_cancel_meeting(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)

    create_r = await client.post("/api/v1/meetings", json={
        "visitor_id": vid, "exhibitor_id": xid, "event_id": eid,
        "scheduled_at": "2026-09-11T14:00:00Z",
    }, headers=organizer_headers)
    mid = create_r.json()["id"]

    r = await client.put(
        f"/api/v1/meetings/{mid}/status",
        json={"status": "cancelled"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"


async def test_meeting_invalid_status(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)

    create_r = await client.post("/api/v1/meetings", json={
        "visitor_id": vid, "exhibitor_id": xid, "event_id": eid,
        "scheduled_at": "2026-09-11T14:00:00Z",
    }, headers=organizer_headers)
    mid = create_r.json()["id"]

    r = await client.put(
        f"/api/v1/meetings/{mid}/status",
        json={"status": "approved"},   # invalid
        headers=organizer_headers,
    )
    assert r.status_code == 422


# ── GET /api/v1/meetings/calendar/{event_id} ──────────────────────────────────

async def test_meeting_calendar(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    vid = await _create_visitor(client, organizer_headers, eid)
    xid = await _create_exhibitor(client, organizer_headers, eid)

    # Create 2 meetings
    for hour in [10, 14]:
        await client.post("/api/v1/meetings", json={
            "visitor_id": vid, "exhibitor_id": xid, "event_id": eid,
            "scheduled_at": f"2026-09-11T{hour:02d}:00:00Z",
        }, headers=organizer_headers)

    r = await client.get(f"/api/v1/meetings/calendar/{eid}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["event_id"] == eid
    assert isinstance(data["meetings"], list)
    assert isinstance(data["total"], int)
    assert data["total"] >= 2


async def test_meeting_calendar_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/meetings/calendar/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404
