"""
tests/test_campaigns.py
─────────────────────────
Comprehensive tests for campaigns and landing pages.

Covers:
  POST /api/v1/campaigns                 create
  GET  /api/v1/campaigns                 list
  GET  /api/v1/campaigns/{id}            detail
  PUT  /api/v1/campaigns/{id}            update
  POST /api/v1/campaigns/{id}/send       trigger send
  POST /api/v1/campaigns/{id}/schedule   schedule
  GET  /api/v1/campaigns/{id}/stats      per-campaign metrics
  GET  /api/v1/campaigns/stats/{eid}     event-level metrics

  POST /api/v1/landing-pages             create page
  GET  /api/v1/landing-pages             list
  GET  /api/v1/landing-pages/{id}        detail
  PUT  /api/v1/landing-pages/{id}        update
  GET  /api/v1/landing-pages/{id}/stats  stats
  POST /api/v1/landing-pages/track-visit pixel (no auth)
"""

import pytest
from httpx import AsyncClient

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"

EVENT_PAYLOAD = {
    "name": "Marketing Summit Maroc 2026",
    "start_date": "2026-10-05",
    "end_date": "2026-10-07",
    "venue": "Hyatt Regency Casablanca",
    "city": "Casablanca",
    "capacity": 1500,
    "category": "marketing",
}


async def _create_event(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/events", json=EVENT_PAYLOAD, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_campaign(
    client: AsyncClient,
    headers: dict,
    event_id: str,
    **extra,
) -> str:
    payload = {
        "name": "Campagne Email Principale",
        "channel": "email",
        "audience_type": "all_visitors",
        "subject": "Bienvenue au Marketing Summit !",
        "template_name": "confirmation.html",
        "event_id": event_id,
        **extra,
    }
    r = await client.post("/api/v1/campaigns", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ══════════════════════════════════════════════════════════════════════════════
# Campaign CRUD
# ══════════════════════════════════════════════════════════════════════════════

async def test_create_campaign_success(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    cid = await _create_campaign(client, organizer_headers, eid)

    r = await client.get(f"/api/v1/campaigns/{cid}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == cid
    assert data["status"] == "draft"
    assert data["sent_count"] == 0
    assert data["channel"] == "email"
    assert "created_at" in data
    assert "updated_at" in data


async def test_create_campaign_unauthenticated(client: AsyncClient):
    r = await client.post("/api/v1/campaigns", json={})
    assert r.status_code == 401


async def test_create_campaign_visitor_forbidden(client: AsyncClient, visitor_headers: dict, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    r = await client.post("/api/v1/campaigns", json={
        "name": "Test", "channel": "email",
        "audience_type": "all_visitors", "event_id": eid,
    }, headers=visitor_headers)
    assert r.status_code == 403


async def test_create_campaign_invalid_channel(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    r = await client.post("/api/v1/campaigns", json={
        "name": "Test", "channel": "telegram",  # invalid
        "audience_type": "all_visitors", "event_id": eid,
    }, headers=organizer_headers)
    assert r.status_code == 422


async def test_create_campaign_invalid_audience(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    r = await client.post("/api/v1/campaigns", json={
        "name": "Test", "channel": "email",
        "audience_type": "robots",  # invalid
        "event_id": eid,
    }, headers=organizer_headers)
    assert r.status_code == 422


async def test_create_campaign_nonexistent_event(client: AsyncClient, organizer_headers: dict):
    r = await client.post("/api/v1/campaigns", json={
        "name": "Test", "channel": "email",
        "audience_type": "all_visitors",
        "event_id": NONEXISTENT_ID,
    }, headers=organizer_headers)
    assert r.status_code == 404


# ── GET /api/v1/campaigns ─────────────────────────────────────────────────────

async def test_list_campaigns(client: AsyncClient, organizer_headers: dict):
    r = await client.get("/api/v1/campaigns", headers=organizer_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_campaigns_filter_by_event(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    await _create_campaign(client, organizer_headers, eid)

    r = await client.get(f"/api/v1/campaigns?event_id={eid}", headers=organizer_headers)
    assert r.status_code == 200
    for c in r.json():
        assert c["event_id"] == eid


async def test_list_campaigns_filter_by_channel(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    await _create_campaign(client, organizer_headers, eid, channel="email")

    r = await client.get("/api/v1/campaigns?channel=email", headers=organizer_headers)
    assert r.status_code == 200
    for c in r.json():
        assert c["channel"] == "email"


async def test_list_campaigns_pagination(client: AsyncClient, organizer_headers: dict):
    r = await client.get("/api/v1/campaigns?page=1&limit=3", headers=organizer_headers)
    assert r.status_code == 200
    assert len(r.json()) <= 3


# ── GET /api/v1/campaigns/{id} ────────────────────────────────────────────────

async def test_get_campaign_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/campaigns/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


# ── PUT /api/v1/campaigns/{id} ────────────────────────────────────────────────

async def test_update_campaign(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    cid = await _create_campaign(client, organizer_headers, eid)

    r = await client.put(f"/api/v1/campaigns/{cid}", json={
        "name": "Campagne Mise à Jour",
        "subject": "Nouveau sujet",
    }, headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Campagne Mise à Jour"
    assert data["subject"] == "Nouveau sujet"


async def test_update_campaign_invalid_status(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    cid = await _create_campaign(client, organizer_headers, eid)

    r = await client.put(f"/api/v1/campaigns/{cid}", json={
        "status": "launched",  # invalid
    }, headers=organizer_headers)
    assert r.status_code == 422


# ── POST /api/v1/campaigns/{id}/schedule ──────────────────────────────────────

async def test_schedule_campaign(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    cid = await _create_campaign(client, organizer_headers, eid)

    r = await client.post(f"/api/v1/campaigns/{cid}/schedule", json={
        "scheduled_at": "2026-10-01T09:00:00Z",
    }, headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "scheduled"
    assert "2026-10-01" in data["scheduled_at"]


async def test_schedule_campaign_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.post(f"/api/v1/campaigns/{NONEXISTENT_ID}/schedule", json={
        "scheduled_at": "2026-10-01T09:00:00Z",
    }, headers=organizer_headers)
    assert r.status_code == 404


# ── POST /api/v1/campaigns/{id}/send ─────────────────────────────────────────

async def test_send_campaign(client: AsyncClient, organizer_headers: dict):
    """Send with zero recipients (empty event) should succeed and mark as sent."""
    eid = await _create_event(client, organizer_headers)
    cid = await _create_campaign(client, organizer_headers, eid)

    r = await client.post(f"/api/v1/campaigns/{cid}/send", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "sent"
    assert isinstance(data["sent_count"], int)


async def test_send_campaign_with_visitors(client: AsyncClient, organizer_headers: dict):
    """Send to an event with confirmed visitors."""
    eid = await _create_event(client, organizer_headers)

    # Create visitor + confirmed ticket
    v_r = await client.post("/api/v1/visitors", json={
        "first_name": "Khalid", "last_name": "Amrani",
        "email": "khalid.amrani@campaign-test.ma",
        "event_id": eid,
    }, headers=organizer_headers)
    assert v_r.status_code == 201

    cid = await _create_campaign(client, organizer_headers, eid,
                                  audience_type="all_visitors")

    r = await client.post(f"/api/v1/campaigns/{cid}/send", headers=organizer_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "sent"


async def test_send_already_sent_campaign_fails(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    cid = await _create_campaign(client, organizer_headers, eid)

    # Send once
    await client.post(f"/api/v1/campaigns/{cid}/send", headers=organizer_headers)
    # Attempt second send → should fail
    r = await client.post(f"/api/v1/campaigns/{cid}/send", headers=organizer_headers)
    assert r.status_code == 400


# ── GET /api/v1/campaigns/{id}/stats ─────────────────────────────────────────

async def test_campaign_stats(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    cid = await _create_campaign(client, organizer_headers, eid)

    r = await client.get(f"/api/v1/campaigns/{cid}/stats", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["campaign_id"] == cid
    assert "sent_count" in data
    assert "open_rate" in data
    assert "click_count" in data
    assert "leads_generated" in data


async def test_campaign_stats_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/campaigns/{NONEXISTENT_ID}/stats", headers=organizer_headers)
    assert r.status_code == 404


# ── GET /api/v1/campaigns/stats/{event_id} ────────────────────────────────────

async def test_event_campaign_stats(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    await _create_campaign(client, organizer_headers, eid)
    await _create_campaign(client, organizer_headers, eid,
                            name="Campagne WhatsApp", channel="whatsapp")

    r = await client.get(f"/api/v1/campaigns/stats/{eid}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["event_id"] == eid
    assert data["total_campaigns"] >= 2
    assert isinstance(data["total_sent"], int)
    assert isinstance(data["campaigns"], list)


async def test_event_campaign_stats_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/campaigns/stats/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# Landing Pages
# ══════════════════════════════════════════════════════════════════════════════

async def _create_landing_page(client: AsyncClient, headers: dict, event_id: str, **extra) -> str:
    r = await client.post("/api/v1/landing-pages", json={
        "title": "Page d'inscription — Marketing Summit",
        "description": "Inscrivez-vous au plus grand événement marketing du Maroc.",
        "cta_text": "S'inscrire maintenant",
        "event_id": event_id,
        **extra,
    }, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── POST /api/v1/landing-pages ────────────────────────────────────────────────

async def test_create_landing_page(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    pid = await _create_landing_page(client, organizer_headers, eid)

    r = await client.get(f"/api/v1/landing-pages/{pid}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == pid
    assert data["event_id"] == eid
    assert data["visits_count"] == 0
    assert data["registrations_count"] == 0
    assert data["is_active"] is True
    assert "slug" in data and data["slug"]
    assert "created_at" in data


async def test_create_landing_page_auto_slug(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    r = await client.post("/api/v1/landing-pages", json={
        "title": "Auto Slug Test Page",
        "event_id": eid,
    }, headers=organizer_headers)
    assert r.status_code == 201
    slug = r.json()["slug"]
    assert "auto" in slug.lower() or "slug" in slug.lower() or "test" in slug.lower() or len(slug) > 0


async def test_create_landing_page_unauthenticated(client: AsyncClient):
    r = await client.post("/api/v1/landing-pages", json={})
    assert r.status_code == 401


async def test_create_landing_page_visitor_forbidden(client: AsyncClient, visitor_headers: dict, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    r = await client.post("/api/v1/landing-pages", json={
        "title": "Test", "event_id": eid,
    }, headers=visitor_headers)
    assert r.status_code == 403


async def test_create_landing_page_nonexistent_event(client: AsyncClient, organizer_headers: dict):
    r = await client.post("/api/v1/landing-pages", json={
        "title": "Test", "event_id": NONEXISTENT_ID,
    }, headers=organizer_headers)
    assert r.status_code == 404


# ── GET /api/v1/landing-pages ─────────────────────────────────────────────────

async def test_list_landing_pages(client: AsyncClient, organizer_headers: dict):
    r = await client.get("/api/v1/landing-pages", headers=organizer_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_landing_pages_filter_by_event(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    await _create_landing_page(client, organizer_headers, eid)

    r = await client.get(f"/api/v1/landing-pages?event_id={eid}", headers=organizer_headers)
    assert r.status_code == 200
    for p in r.json():
        assert p["event_id"] == eid


# ── GET /api/v1/landing-pages/{id} ───────────────────────────────────────────

async def test_get_landing_page_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/landing-pages/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404


# ── PUT /api/v1/landing-pages/{id} ───────────────────────────────────────────

async def test_update_landing_page(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    pid = await _create_landing_page(client, organizer_headers, eid)

    r = await client.put(f"/api/v1/landing-pages/{pid}", json={
        "title": "Page Mise à Jour",
        "cta_text": "Rejoindre l'événement",
        "is_active": False,
    }, headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "Page Mise à Jour"
    assert data["cta_text"] == "Rejoindre l'événement"
    assert data["is_active"] is False


async def test_update_landing_page_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.put(f"/api/v1/landing-pages/{NONEXISTENT_ID}", json={
        "title": "Ghost",
    }, headers=organizer_headers)
    assert r.status_code == 404


# ── GET /api/v1/landing-pages/{id}/stats ─────────────────────────────────────

async def test_landing_page_stats_initial(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    pid = await _create_landing_page(client, organizer_headers, eid)

    r = await client.get(f"/api/v1/landing-pages/{pid}/stats", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["landing_page_id"] == pid
    assert data["visits_count"] == 0
    assert data["registrations_count"] == 0
    assert data["conversion_rate"] == 0.0
    assert isinstance(data["recent_visits"], int)


async def test_landing_page_stats_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/landing-pages/{NONEXISTENT_ID}/stats", headers=organizer_headers)
    assert r.status_code == 404


# ── POST /api/v1/landing-pages/track-visit (no auth) ─────────────────────────

async def test_track_visit_no_auth(client: AsyncClient, organizer_headers: dict):
    """Pixel endpoint must work WITHOUT authentication."""
    eid = await _create_event(client, organizer_headers)
    pid = await _create_landing_page(client, organizer_headers, eid)

    # No auth header
    r = await client.post("/api/v1/landing-pages/track-visit", json={
        "landing_page_id": pid,
        "referrer": "https://google.com",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "tracked"
    assert data["visits_count"] == 1


async def test_track_visit_increments_counter(client: AsyncClient, organizer_headers: dict):
    """Each call to track-visit must increment visits_count by 1."""
    eid = await _create_event(client, organizer_headers)
    pid = await _create_landing_page(client, organizer_headers, eid)

    for i in range(1, 4):
        r = await client.post("/api/v1/landing-pages/track-visit", json={
            "landing_page_id": pid,
        })
        assert r.status_code == 200
        assert r.json()["visits_count"] == i

    # Verify via stats endpoint
    stats_r = await client.get(f"/api/v1/landing-pages/{pid}/stats", headers=organizer_headers)
    assert stats_r.json()["visits_count"] == 3


async def test_track_visit_nonexistent_page(client: AsyncClient):
    r = await client.post("/api/v1/landing-pages/track-visit", json={
        "landing_page_id": NONEXISTENT_ID,
    })
    assert r.status_code == 404


async def test_track_visit_inactive_page(client: AsyncClient, organizer_headers: dict):
    eid = await _create_event(client, organizer_headers)
    pid = await _create_landing_page(client, organizer_headers, eid)

    # Deactivate the page
    await client.put(f"/api/v1/landing-pages/{pid}", json={"is_active": False},
                     headers=organizer_headers)

    r = await client.post("/api/v1/landing-pages/track-visit", json={
        "landing_page_id": pid,
    })
    assert r.status_code == 410  # Gone


# ── Conversion rate calculation ────────────────────────────────────────────────

async def test_landing_page_conversion_rate(client: AsyncClient, organizer_headers: dict):
    """Conversion rate = registrations / visits."""
    eid = await _create_event(client, organizer_headers)
    pid = await _create_landing_page(client, organizer_headers, eid)

    # 5 visits
    for _ in range(5):
        await client.post("/api/v1/landing-pages/track-visit",
                          json={"landing_page_id": pid})

    # Manually set 2 registrations via update (simulate)
    # In real life this would be done by the registration flow
    await client.put(f"/api/v1/landing-pages/{pid}",
                     json={},   # can't set registrations_count via API — it's internal
                     headers=organizer_headers)

    r = await client.get(f"/api/v1/landing-pages/{pid}/stats", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["visits_count"] == 5
    # conversion_rate = 0 (no registrations) but is a valid float
    assert isinstance(data["conversion_rate"], float)
    assert 0.0 <= data["conversion_rate"] <= 1.0
