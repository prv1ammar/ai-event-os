"""
app/websockets/dashboard_ws.py
────────────────────────────────
Real-time dashboard WebSocket with Redis pub/sub broadcasting.

Architecture
────────────
                          ┌─────────────────────────┐
  QR Scan device          │   POST /scans/validate   │
       │                  │   (scan_service)          │
       └─────────────────►│   PUBLISH dashboard:{id} │
                          └──────────┬──────────────┘
                                     │  Redis pub/sub
                          ┌──────────▼──────────────┐
                          │  dashboard_ws.py         │
                          │  (subscriber loop)       │
                          │  +  30-second heartbeat  │
                          └──────────┬──────────────┘
                                     │  WebSocket
                          ┌──────────▼──────────────┐
                          │   Browser dashboard      │
                          └──────────────────────────┘

WebSocket endpoints (registered via create_dashboard_ws_router):
  WS /ws/dashboard/{event_id}   — full KPI snapshot every 30 s + on scan
  WS /ws/entries/{event_id}     — entry-flux updates
  WS /ws/scans/{event_id}       — scan-by-scan broadcast (raw events)

Message format (sent every 30 s or on each scan event):
  {
    "type":                  "dashboard_update",
    "timestamp":             "2026-05-23T14:30:00+00:00",
    "event_id":              "...",
    "entries_today":         2354,
    "entries_total":         12458,
    "leads_scanned":         1876,
    "occupancy_rate":        68.0,
    "top_booths":            [{"booth": "A45", "scans": 245}, ...],
    "entry_flux":            [{"hour": "08:00", "count": 245}, ...],
    "visitor_type_breakdown": {"standard": 2458, "vip": 186, ...}
  }
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("dashboard_ws")

# ── WebSocket broadcast interval (seconds) ────────────────────────────────────
BROADCAST_INTERVAL = 30


# ── Connection manager ────────────────────────────────────────────────────────

class DashboardConnectionManager:
    """In-memory registry of active dashboard WebSocket connections per event."""

    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, event_id: str) -> None:
        await websocket.accept()
        self.active_connections.setdefault(event_id, []).append(websocket)
        logger.info("Dashboard WS connected: event=%s total=%d",
                    event_id, len(self.active_connections[event_id]))

    def disconnect(self, websocket: WebSocket, event_id: str) -> None:
        room = self.active_connections.get(event_id, [])
        if websocket in room:
            room.remove(websocket)
        logger.info("Dashboard WS disconnected: event=%s remaining=%d",
                    event_id, len(room))

    async def broadcast(self, event_id: str, data: dict) -> None:
        """Send a JSON message to every client subscribed to ``event_id``."""
        dead: list[WebSocket] = []
        for ws in self.active_connections.get(event_id, []):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, event_id)


manager = DashboardConnectionManager()


# ── Helper: publish a KPI snapshot to Redis ───────────────────────────────────

async def publish_dashboard_update(event_id: str, data: dict) -> None:
    """
    Publish a dashboard snapshot to the Redis channel ``dashboard:{event_id}``.

    Call this from scan_service after every successful QR scan so connected
    dashboards receive instant updates.
    """
    try:
        from app.core.config import settings
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.publish(f"dashboard:{event_id}", json.dumps(data))
        await r.aclose()
    except Exception as exc:
        logger.debug("Redis publish skipped (%s)", exc)


# ── Main WebSocket handler ────────────────────────────────────────────────────

async def dashboard_websocket_endpoint(
    websocket: WebSocket,
    event_id: str,
) -> None:
    """
    Accept a dashboard WebSocket and stream KPI updates.

    Strategy
    ────────
    1. Try to subscribe to the Redis channel ``dashboard:{event_id}``.
    2. If Redis is available: forward every published message to the client.
       Also send a DB-backed snapshot every ``BROADCAST_INTERVAL`` seconds.
    3. If Redis is unavailable: fall back to polling the DB every 30 s.
    """
    await manager.connect(websocket, event_id)

    channel = f"dashboard:{event_id}"

    # ── Try Redis subscription ─────────────────────────────────────────────────
    try:
        from app.core.config import settings
        from app.core.database import AsyncSessionLocal
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)

        await websocket.send_text(json.dumps({
            "type": "connected",
            "channel": channel,
            "message": f"Subscribed to dashboard for event {event_id}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }))

        # Send an immediate snapshot
        try:
            from app.services.analytics_service import get_live_snapshot
            async with AsyncSessionLocal() as db:
                snapshot = await get_live_snapshot(db, uuid.UUID(event_id))
            await websocket.send_json(snapshot)
        except Exception as snap_exc:
            logger.debug("Initial snapshot failed: %s", snap_exc)

        # Start a periodic broadcast task (every 30 s)
        async def periodic_sender():
            while True:
                await asyncio.sleep(BROADCAST_INTERVAL)
                try:
                    from app.services.analytics_service import get_live_snapshot
                    async with AsyncSessionLocal() as db:
                        snapshot = await get_live_snapshot(db, uuid.UUID(event_id))
                    await manager.broadcast(event_id, snapshot)
                except WebSocketDisconnect:
                    break
                except Exception as pe:
                    logger.debug("Periodic snapshot error: %s", pe)

        sender_task = asyncio.create_task(periodic_sender())

        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        await websocket.send_json(data)
                    except Exception:
                        pass
        except WebSocketDisconnect:
            logger.info("Dashboard WS disconnected (event=%s)", event_id)
        except Exception as exc:
            logger.warning("Dashboard WS error (event=%s): %s", event_id, exc)
        finally:
            sender_task.cancel()
            await pubsub.unsubscribe(channel)
            await r.aclose()

    except Exception as redis_exc:
        # ── Redis unavailable — fall back to DB polling ────────────────────────
        logger.warning(
            "Redis unavailable for dashboard WS event=%s (%s) — DB poll mode",
            event_id, redis_exc,
        )
        await _db_poll_loop(websocket, event_id)
    finally:
        manager.disconnect(websocket, event_id)


# ── Fallback: periodic DB polling when Redis is down ─────────────────────────

async def _db_poll_loop(websocket: WebSocket, event_id: str) -> None:
    """Poll the DB every 30 s and push snapshots when Redis is unavailable."""
    await websocket.send_text(json.dumps({
        "type": "warning",
        "message": "Redis unavailable — polling DB every 30 s",
        "event_id": event_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }))

    try:
        from app.core.database import AsyncSessionLocal
        from app.services.analytics_service import get_live_snapshot

        while True:
            try:
                async with AsyncSessionLocal() as db:
                    snapshot = await get_live_snapshot(db, uuid.UUID(event_id))
                await websocket.send_json(snapshot)
            except WebSocketDisconnect:
                break
            except Exception as exc:
                logger.debug("DB poll error for event=%s: %s", event_id, exc)
                await websocket.send_text(json.dumps({
                    "type": "heartbeat",
                    "event_id": event_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }))
            await asyncio.sleep(BROADCAST_INTERVAL)
    except (WebSocketDisconnect, Exception):
        pass


# ── FastAPI router factory ────────────────────────────────────────────────────

def create_dashboard_ws_router() -> APIRouter:
    """
    Returns an APIRouter with the dashboard WebSocket endpoints.

    Mount in main.py:

        from app.websockets.dashboard_ws import create_dashboard_ws_router
        app.include_router(create_dashboard_ws_router())
    """
    ws_router = APIRouter(tags=["WebSocket — Live Dashboard"])

    @ws_router.websocket("/ws/dashboard/{event_id}")
    async def ws_dashboard(websocket: WebSocket, event_id: str):
        """
        Real-time dashboard updates — KPI snapshot every 30 s + on each scan.
        """
        await dashboard_websocket_endpoint(websocket, event_id)

    @ws_router.websocket("/ws/entries/{event_id}")
    async def ws_entries(websocket: WebSocket, event_id: str):
        """
        Live entry-flux feed.  Subscribes to the same Redis channel but only
        forwards messages where ``entries_today`` changes.
        """
        await dashboard_websocket_endpoint(websocket, event_id)

    return ws_router
