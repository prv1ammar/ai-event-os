"""
tests/test_sessions.py
───────────────────────
Tests for /api/v1/sessions and /api/v1/speakers endpoints.

Covers:
  - Session CRUD lifecycle
  - Speaker CRUD lifecycle
  - Speaker assignment to sessions (same-event guard)
  - Visitor registration: capacity enforcement, duplicate protection
  - Attendance list and pagination
  - Date filter on session list
  - 404 handling and validation errors
"""

import pytest
from httpx import AsyncClient

# ── Constants ──────────────────────────────────────────────────────────────────

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"

EVENT_PAYLOAD = {
    "name": "Conférence IA & Innovation 2026",
    "start_date": "2026-10-20",
    "end_date": "2026-10-22",
    "venue": "Palais des Congrès de Marrakech",
    "city": "Marrakech",
    "capacity": 1500,
    "category": "conference",
}

SESSION_BASE = {
    "title": "L'IA dans l'industrie agroalimentaire",
    "description": "Comment l'IA transforme le secteur.",
    "session_type": "keynote",
    "room": "Salle Atlas",
    "capacity": 100,
    "start_time": "2026-10-20T10:00:00",
    "end_time": "2026-10-20T11:00:00",
}

SPEAKER_BASE = {
    "first_name": "Laila",
    "last_name": "Bensouda",
    "company": "AI Ventures Maroc",
    "bio": "Expert en intelligence artificielle.",
    "expertise": "Machine Learning",
}

VISITOR_PAYLOAD = {
    "first_name": "Hassan",
    "last_name": "Alaoui",
    "email": "hassan@test.ma",
    "company": "Startup Hub",
    "type": "standard",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _create_event(client: AsyncClient, headers: dict, name: str = "Test Event") -> str:
    payload = {**EVENT_PAYLOAD, "name": name}
    r = await client.post("/api/v1/events", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_session(
    client: AsyncClient,
    headers: dict,
    event_id: str,
    title: str = SESSION_BASE["title"],
    room: str = "Salle Atlas",
    capacity: int = 100,
) -> dict:
    payload = {
        **SESSION_BASE,
        "event_id": event_id,
        "title": title,
        "room": room,
        "capacity": capacity,
    }
    r = await client.post("/api/v1/sessions", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def _create_speaker(
    client: AsyncClient,
    headers: dict,
    event_id: str,
    first_name: str = "Laila",
) -> dict:
    payload = {**SPEAKER_BASE, "event_id": event_id, "first_name": first_name}
    r = await client.post("/api/v1/speakers", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def _create_visitor(client: AsyncClient, headers: dict, event_id: str, email: str = "hassan@test.ma") -> str:
    """Create a visitor directly via the visitors endpoint (other agent's router)."""
    payload = {**VISITOR_PAYLOAD, "event_id": event_id, "email": email}
    r = await client.post("/api/v1/visitors", json=payload, headers=headers)
    # Visitors endpoint belongs to another agent — skip test gracefully if not implemented
    if r.status_code == 404:
        pytest.skip("visitors endpoint not yet implemented")
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ══════════════════════════════════════════════════════════════════════════════
# SESSION TESTS
# ══════════════════════════════════════════════════════════════════════════════

# ── POST /api/v1/sessions ─────────────────────────────────────────────────────

async def test_create_session(client: AsyncClient, organizer_headers: dict):
    """Organizer creates a session; response has all required fields."""
    event_id = await _create_event(client, organizer_headers)
    data = await _create_session(client, organizer_headers, event_id)

    assert data["title"] == SESSION_BASE["title"]
    assert data["session_type"] == "keynote"
    assert data["event_id"] == event_id
    assert data["capacity"] == 100
    assert "id" in data
    assert "speakers" in data
    assert isinstance(data["speakers"], list)


async def test_create_session_visitor_forbidden(
    client: AsyncClient, organizer_headers: dict, visitor_headers: dict
):
    """Visitor cannot create sessions (403)."""
    event_id = await _create_event(client, organizer_headers)
    payload = {**SESSION_BASE, "event_id": event_id}
    response = await client.post("/api/v1/sessions", json=payload, headers=visitor_headers)
    assert response.status_code == 403


async def test_create_session_invalid_event(client: AsyncClient, organizer_headers: dict):
    """Creating session for non-existent event returns 404."""
    payload = {**SESSION_BASE, "event_id": NONEXISTENT_ID}
    response = await client.post("/api/v1/sessions", json=payload, headers=organizer_headers)
    assert response.status_code == 404


async def test_create_session_invalid_end_before_start(client: AsyncClient, organizer_headers: dict):
    """end_time before start_time returns 422."""
    event_id = await _create_event(client, organizer_headers)
    payload = {
        **SESSION_BASE,
        "event_id": event_id,
        "start_time": "2026-10-20T12:00:00",
        "end_time": "2026-10-20T10:00:00",
    }
    response = await client.post("/api/v1/sessions", json=payload, headers=organizer_headers)
    assert response.status_code == 422


async def test_create_session_invalid_type(client: AsyncClient, organizer_headers: dict):
    """Invalid session_type returns 422."""
    event_id = await _create_event(client, organizer_headers)
    payload = {**SESSION_BASE, "event_id": event_id, "session_type": "lecture"}
    response = await client.post("/api/v1/sessions", json=payload, headers=organizer_headers)
    assert response.status_code == 422


async def test_create_session_with_speaker_preassign(client: AsyncClient, organizer_headers: dict):
    """Speaker IDs can be pre-assigned during session creation."""
    event_id = await _create_event(client, organizer_headers)
    speaker = await _create_speaker(client, organizer_headers, event_id)
    speaker_id = speaker["id"]

    payload = {**SESSION_BASE, "event_id": event_id, "speaker_ids": [speaker_id]}
    response = await client.post("/api/v1/sessions", json=payload, headers=organizer_headers)
    assert response.status_code == 201
    data = response.json()
    assert len(data["speakers"]) == 1
    assert data["speakers"][0]["id"] == speaker_id


# ── GET /api/v1/sessions ──────────────────────────────────────────────────────

async def test_list_sessions(client: AsyncClient, organizer_headers: dict):
    """List endpoint returns array."""
    response = await client.get("/api/v1/sessions", headers=organizer_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_list_sessions_filter_by_event(client: AsyncClient, organizer_headers: dict):
    """event_id filter restricts results."""
    event_id = await _create_event(client, organizer_headers, "Filter Session Event")
    await _create_session(client, organizer_headers, event_id, "Filtered Session")

    response = await client.get(f"/api/v1/sessions?event_id={event_id}", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert all(s["event_id"] == event_id for s in data)


async def test_list_sessions_filter_by_type(client: AsyncClient, organizer_headers: dict):
    """session_type filter works."""
    event_id = await _create_event(client, organizer_headers, "Type Filter Event")
    await _create_session(client, organizer_headers, event_id)

    response = await client.get(f"/api/v1/sessions?event_id={event_id}&session_type=keynote", headers=organizer_headers)
    assert response.status_code == 200
    for s in response.json():
        assert s["session_type"] == "keynote"


async def test_list_sessions_filter_by_date(client: AsyncClient, organizer_headers: dict):
    """Date filter returns only sessions on that date."""
    event_id = await _create_event(client, organizer_headers, "Date Filter Event")
    await _create_session(client, organizer_headers, event_id)

    response = await client.get(
        f"/api/v1/sessions?event_id={event_id}&date=2026-10-20",
        headers=organizer_headers,
    )
    assert response.status_code == 200
    for s in response.json():
        assert "2026-10-20" in s["start_time"]


# ── GET /api/v1/sessions/{id} ─────────────────────────────────────────────────

async def test_get_session_by_id(client: AsyncClient, organizer_headers: dict):
    """Detail endpoint returns correct data with speakers list."""
    event_id = await _create_event(client, organizer_headers)
    session = await _create_session(client, organizer_headers, event_id)
    session_id = session["id"]

    response = await client.get(f"/api/v1/sessions/{session_id}", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == session_id
    assert "speakers" in data


async def test_get_session_not_found(client: AsyncClient, organizer_headers: dict):
    """Unknown session returns 404."""
    response = await client.get(f"/api/v1/sessions/{NONEXISTENT_ID}", headers=organizer_headers)
    assert response.status_code == 404


# ── PUT /api/v1/sessions/{id} ─────────────────────────────────────────────────

async def test_update_session(client: AsyncClient, organizer_headers: dict):
    """Partial update changes only the supplied fields."""
    event_id = await _create_event(client, organizer_headers)
    session = await _create_session(client, organizer_headers, event_id)
    session_id = session["id"]

    response = await client.put(
        f"/api/v1/sessions/{session_id}",
        json={"room": "Grande Salle", "capacity": 200},
        headers=organizer_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["room"] == "Grande Salle"
    assert data["capacity"] == 200
    assert data["title"] == SESSION_BASE["title"]  # unchanged


async def test_update_session_not_found(client: AsyncClient, organizer_headers: dict):
    """Updating unknown session returns 404."""
    response = await client.put(
        f"/api/v1/sessions/{NONEXISTENT_ID}",
        json={"room": "Ghost Room"},
        headers=organizer_headers,
    )
    assert response.status_code == 404


# ── POST /api/v1/sessions/{id}/register & GET attendance ─────────────────────

async def test_session_registration(client: AsyncClient, organizer_headers: dict):
    """Visitor registration returns 201 with session_id and visitor_id."""
    event_id = await _create_event(client, organizer_headers)
    session = await _create_session(client, organizer_headers, event_id)
    session_id = session["id"]
    visitor_id = await _create_visitor(client, organizer_headers, event_id)

    response = await client.post(
        f"/api/v1/sessions/{session_id}/register",
        json={"visitor_id": visitor_id},
        headers=organizer_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["session_id"] == session_id
    assert data["visitor_id"] == visitor_id
    assert "registered_at" in data


async def test_session_registration_duplicate(client: AsyncClient, organizer_headers: dict):
    """Registering the same visitor twice returns 409."""
    event_id = await _create_event(client, organizer_headers)
    session = await _create_session(client, organizer_headers, event_id)
    session_id = session["id"]
    visitor_id = await _create_visitor(client, organizer_headers, event_id, "dup@test.ma")

    await client.post(f"/api/v1/sessions/{session_id}/register", json={"visitor_id": visitor_id}, headers=organizer_headers)
    response = await client.post(
        f"/api/v1/sessions/{session_id}/register",
        json={"visitor_id": visitor_id},
        headers=organizer_headers,
    )
    assert response.status_code == 409
    assert "already registered" in response.json()["detail"].lower()


async def test_session_registration_capacity_exceeded(client: AsyncClient, organizer_headers: dict):
    """Registration beyond capacity returns 409."""
    event_id = await _create_event(client, organizer_headers)
    # Session with capacity 1
    session = await _create_session(client, organizer_headers, event_id, "Tiny Session", capacity=1)
    session_id = session["id"]

    visitor1 = await _create_visitor(client, organizer_headers, event_id, "v1@test.ma")
    visitor2 = await _create_visitor(client, organizer_headers, event_id, "v2@test.ma")

    # First registration succeeds
    r = await client.post(f"/api/v1/sessions/{session_id}/register", json={"visitor_id": visitor1}, headers=organizer_headers)
    assert r.status_code == 201

    # Second registration fails (over capacity)
    r = await client.post(f"/api/v1/sessions/{session_id}/register", json={"visitor_id": visitor2}, headers=organizer_headers)
    assert r.status_code == 409
    assert "fully booked" in r.json()["detail"].lower()


async def test_get_session_attendance(client: AsyncClient, organizer_headers: dict):
    """Attendance list returns session info + attendees."""
    event_id = await _create_event(client, organizer_headers)
    session = await _create_session(client, organizer_headers, event_id)
    session_id = session["id"]

    response = await client.get(f"/api/v1/sessions/{session_id}/attendance", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == session_id
    assert data["session_title"] == session["title"]
    assert isinstance(data["total_registered"], int)
    assert isinstance(data["attendees"], list)


# ══════════════════════════════════════════════════════════════════════════════
# SPEAKER TESTS
# ══════════════════════════════════════════════════════════════════════════════

# ── POST /api/v1/speakers ─────────────────────────────────────────────────────

async def test_create_speaker(client: AsyncClient, organizer_headers: dict):
    """Organizer creates a speaker."""
    event_id = await _create_event(client, organizer_headers)
    data = await _create_speaker(client, organizer_headers, event_id)

    assert data["first_name"] == SPEAKER_BASE["first_name"]
    assert data["last_name"] == SPEAKER_BASE["last_name"]
    assert data["event_id"] == event_id
    assert data["sessions"] == []


async def test_create_speaker_visitor_forbidden(
    client: AsyncClient, organizer_headers: dict, visitor_headers: dict
):
    """Visitor cannot create speakers (403)."""
    event_id = await _create_event(client, organizer_headers)
    payload = {**SPEAKER_BASE, "event_id": event_id}
    response = await client.post("/api/v1/speakers", json=payload, headers=visitor_headers)
    assert response.status_code == 403


async def test_create_speaker_invalid_event(client: AsyncClient, organizer_headers: dict):
    """Creating speaker for non-existent event returns 404."""
    payload = {**SPEAKER_BASE, "event_id": NONEXISTENT_ID}
    response = await client.post("/api/v1/speakers", json=payload, headers=organizer_headers)
    assert response.status_code == 404


# ── GET /api/v1/speakers ──────────────────────────────────────────────────────

async def test_list_speakers(client: AsyncClient, organizer_headers: dict):
    """List returns array."""
    response = await client.get("/api/v1/speakers", headers=organizer_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_list_speakers_filter_by_event(client: AsyncClient, organizer_headers: dict):
    """event_id filter restricts results."""
    event_id = await _create_event(client, organizer_headers, "Speaker Filter Event")
    await _create_speaker(client, organizer_headers, event_id, "Amina")

    response = await client.get(f"/api/v1/speakers?event_id={event_id}", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert all(s["event_id"] == event_id for s in data)


# ── GET /api/v1/speakers/{id} ─────────────────────────────────────────────────

async def test_get_speaker_by_id(client: AsyncClient, organizer_headers: dict):
    """Detail endpoint returns correct data with sessions list."""
    event_id = await _create_event(client, organizer_headers)
    speaker = await _create_speaker(client, organizer_headers, event_id)
    speaker_id = speaker["id"]

    response = await client.get(f"/api/v1/speakers/{speaker_id}", headers=organizer_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == speaker_id
    assert "sessions" in data


async def test_get_speaker_not_found(client: AsyncClient, organizer_headers: dict):
    """Unknown speaker returns 404."""
    response = await client.get(f"/api/v1/speakers/{NONEXISTENT_ID}", headers=organizer_headers)
    assert response.status_code == 404


# ── PUT /api/v1/speakers/{id} ─────────────────────────────────────────────────

async def test_update_speaker(client: AsyncClient, organizer_headers: dict):
    """Partial update changes only the specified fields."""
    event_id = await _create_event(client, organizer_headers)
    speaker = await _create_speaker(client, organizer_headers, event_id)
    speaker_id = speaker["id"]

    response = await client.put(
        f"/api/v1/speakers/{speaker_id}",
        json={"company": "TechCorp Global", "expertise": "Deep Learning"},
        headers=organizer_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["company"] == "TechCorp Global"
    assert data["expertise"] == "Deep Learning"
    assert data["first_name"] == SPEAKER_BASE["first_name"]  # unchanged


# ── POST /api/v1/speakers/{id}/assign ─────────────────────────────────────────

async def test_assign_speaker_to_session(client: AsyncClient, organizer_headers: dict):
    """Speaker can be assigned to a session in the same event."""
    event_id = await _create_event(client, organizer_headers)
    speaker = await _create_speaker(client, organizer_headers, event_id)
    session = await _create_session(client, organizer_headers, event_id)

    speaker_id = speaker["id"]
    session_id = session["id"]

    response = await client.post(
        f"/api/v1/speakers/{speaker_id}/assign",
        json={"session_id": session_id},
        headers=organizer_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["speaker_id"] == speaker_id
    assert data["session_id"] == session_id
    assert "assigned" in data["message"].lower()


async def test_assign_speaker_idempotent(client: AsyncClient, organizer_headers: dict):
    """Assigning an already-assigned speaker is a no-op (returns 201 both times)."""
    event_id = await _create_event(client, organizer_headers)
    speaker = await _create_speaker(client, organizer_headers, event_id)
    session = await _create_session(client, organizer_headers, event_id)

    payload = {"session_id": session["id"]}
    # First assignment
    r1 = await client.post(f"/api/v1/speakers/{speaker['id']}/assign", json=payload, headers=organizer_headers)
    assert r1.status_code == 201
    # Second assignment — idempotent
    r2 = await client.post(f"/api/v1/speakers/{speaker['id']}/assign", json=payload, headers=organizer_headers)
    assert r2.status_code == 201

    # Speaker detail should still show only one session
    detail = await client.get(f"/api/v1/speakers/{speaker['id']}", headers=organizer_headers)
    assert len(detail.json()["sessions"]) == 1


async def test_assign_speaker_cross_event_forbidden(client: AsyncClient, organizer_headers: dict):
    """Speaker cannot be assigned to a session from a different event (422)."""
    event_id_1 = await _create_event(client, organizer_headers, "Event One")
    event_id_2 = await _create_event(client, organizer_headers, "Event Two")

    speaker = await _create_speaker(client, organizer_headers, event_id_1)
    session = await _create_session(client, organizer_headers, event_id_2)

    response = await client.post(
        f"/api/v1/speakers/{speaker['id']}/assign",
        json={"session_id": session["id"]},
        headers=organizer_headers,
    )
    assert response.status_code == 422
    assert "same event" in response.json()["detail"].lower()


async def test_assign_speaker_session_not_found(client: AsyncClient, organizer_headers: dict):
    """Assigning to non-existent session returns 404."""
    event_id = await _create_event(client, organizer_headers)
    speaker = await _create_speaker(client, organizer_headers, event_id)

    response = await client.post(
        f"/api/v1/speakers/{speaker['id']}/assign",
        json={"session_id": NONEXISTENT_ID},
        headers=organizer_headers,
    )
    assert response.status_code == 404


async def test_assign_speaker_speaker_not_found(client: AsyncClient, organizer_headers: dict):
    """Assigning non-existent speaker returns 404."""
    event_id = await _create_event(client, organizer_headers)
    session = await _create_session(client, organizer_headers, event_id)

    response = await client.post(
        f"/api/v1/speakers/{NONEXISTENT_ID}/assign",
        json={"session_id": session["id"]},
        headers=organizer_headers,
    )
    assert response.status_code == 404


# ── Speaker appears in session after assignment ────────────────────────────────

async def test_speaker_appears_in_session_after_assign(client: AsyncClient, organizer_headers: dict):
    """After assignment, the speaker is listed inside the session's speakers list."""
    event_id = await _create_event(client, organizer_headers)
    speaker = await _create_speaker(client, organizer_headers, event_id, "Nadia")
    session = await _create_session(client, organizer_headers, event_id, "Assigned Session")

    await client.post(
        f"/api/v1/speakers/{speaker['id']}/assign",
        json={"session_id": session["id"]},
        headers=organizer_headers,
    )

    # Fetch session — speaker should appear
    sess_detail = await client.get(f"/api/v1/sessions/{session['id']}", headers=organizer_headers)
    assert sess_detail.status_code == 200
    speaker_ids_in_session = [sp["id"] for sp in sess_detail.json()["speakers"]]
    assert speaker["id"] in speaker_ids_in_session

    # Fetch speaker — session should appear
    spkr_detail = await client.get(f"/api/v1/speakers/{speaker['id']}", headers=organizer_headers)
    assert spkr_detail.status_code == 200
    session_ids_in_speaker = [s["id"] for s in spkr_detail.json()["sessions"]]
    assert session["id"] in session_ids_in_speaker
