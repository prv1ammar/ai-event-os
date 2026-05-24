"""
app/websockets/scans_ws.py
───────────────────────────
Real-time scan broadcast via WebSocket + Redis pub/sub.

Architecture:
  Scan device  →  POST /api/v1/scans/validate  →  scan_service
                                                       │
                                              Redis PUBLISH scans:{event_id}
                                                       │
                                              WebSocket subscriber
                                                       │
                                           All connected dashboards

WebSocket endpoint:
  WS /ws/scans/live/{event_id}

Message format pushed to clients:
  {
    "type":            "scan",
    "scan_type":       "entry",
    "zone":            "entry_general",
    "visitor_type":    "vip",
    "visitor_name":    "Ahmed Benali",
    "timestamp":       "2026-05-23T09:45:22+00:00",
    "entries_today":   1289,
    "visitors_online": 876
  }

Connection errors (e.g. Redis unavailable) are handled gracefully:
  the WebSocket stays open and sends heartbeat pings every 30 s so
  the frontend can detect a stale connection.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("scans_ws")


# ── WebSocket handler ─────────────────────────────────────────────────────────

async def scan_websocket_endpoint(websocket: WebSocket, event_id: str) -> None:
    """
    Accept a WebSocket connection and stream live scan events for the given event.

    Subscribes to the Redis Pub/Sub channel `scans:{event_id}` and forwards
    every message to the connected dashboard client.

    Falls back gracefully if Redis is unavailable — sends a connection-status
    message and then sends periodic heartbeats.
    """
    await websocket.accept()
    logger.info("WebSocket connected for event %s", event_id)

    channel = f"scans:{event_id}"

    # ── Try to set up Redis subscription ──────────────────────────────────────
    try:
        from app.core.config import settings
        import redis.asyncio as aioredis

        r      = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)

        await websocket.send_text(json.dumps({
            "type":    "connected",
            "channel": channel,
            "message": f"Subscribed to live scans for event {event_id}",
        }))

        # ── Main receive loop ──────────────────────────────────────────────────
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    # Forward the raw JSON string — no re-serialisation needed
                    await websocket.send_text(message["data"])

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected for event %s", event_id)
        except Exception as exc:
            logger.warning("WebSocket error for event %s: %s", event_id, exc)
        finally:
            await pubsub.unsubscribe(channel)
            await r.aclose()

    except Exception as redis_exc:
        # Redis is unavailable — fall back to heartbeat mode
        logger.warning(
            "Redis unavailable for WS event %s (%s) — heartbeat mode",
            event_id,
            redis_exc,
        )
        await _heartbeat_loop(websocket, event_id)


async def _heartbeat_loop(websocket: WebSocket, event_id: str) -> None:
    """
    Fallback when Redis is not reachable.

    Sends a heartbeat ping every 30 seconds so the frontend knows the
    connection is alive but Redis is down.
    """
    await websocket.send_text(json.dumps({
        "type":    "warning",
        "message": "Redis unavailable — live scan events will not be received",
        "event_id": event_id,
    }))

    try:
        while True:
            await asyncio.sleep(30)
            await websocket.send_text(json.dumps({
                "type":     "heartbeat",
                "event_id": event_id,
            }))
    except (WebSocketDisconnect, Exception):
        pass


# ── FastAPI router factory ────────────────────────────────────────────────────

def create_scans_ws_router():
    """
    Returns an APIRouter that registers the WebSocket endpoint.

    Mount this in main.py alongside the REST routers:

        from app.websockets.scans_ws import create_scans_ws_router
        app.include_router(create_scans_ws_router())
    """
    from fastapi import APIRouter

    ws_router = APIRouter(tags=["WebSocket — Live Scans"])

    @ws_router.websocket("/ws/scans/live/{event_id}")
    async def ws_live_scans(websocket: WebSocket, event_id: str):
        await scan_websocket_endpoint(websocket, event_id)

    return ws_router
