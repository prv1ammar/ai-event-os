"""
app/services/scan_service.py
──────────────────────────────
QR scan validation and access-control logic.

Zone → scan_type mapping
────────────────────────
entry_general    → "entry"
lounge_vip       → "lounge"
lounge_press     → "lounge"
restaurant       → "restaurant"
session_general  → "session"
session_reserved → "session"
backstage        → "entry"

Zone access matrix (visitor type → allowed zones)
──────────────────────────────────────────────────
Zone             standard  vip  press  partner  organizer  speaker
entry_general       ✓       ✓     ✓      ✓         ✓         ✓
lounge_vip          ✗       ✓     ✗      ✓         ✓         ✓
lounge_press        ✗       ✗     ✓      ✗         ✓         ✗
restaurant          ✓       ✓     ✓      ✓         ✓         ✓
session_general     ✓       ✓     ✓      ✓         ✓         ✓
session_reserved  if reg    ✓   if reg  if reg      ✓       if reg
backstage           ✗       ✗     ✗      ✗         ✓         ✓

Redis pub/sub: after a valid scan the event is published to
  channel  scans:{event_id}
so the WebSocket hub can broadcast it to live dashboards.
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.session_attendance import SessionAttendance
from app.models.ticket import QRScan, Ticket
from app.models.visitor import Visitor
from app.services.qr_service import parse_qr_data

# ── Access matrix ──────────────────────────────────────────────────────────────

# Full-access zones (all visitor types allowed)
_ALL_TYPES = frozenset({"standard", "vip", "press", "partner", "organizer", "speaker"})

ZONE_ACCESS: dict[str, frozenset[str]] = {
    "entry_general":    _ALL_TYPES,
    "lounge_vip":       frozenset({"vip", "partner", "organizer", "speaker"}),
    "lounge_press":     frozenset({"press", "organizer"}),
    "restaurant":       _ALL_TYPES,
    "session_general":  _ALL_TYPES,
    # session_reserved: handled separately (registration check)
    "backstage":        frozenset({"organizer", "speaker"}),
}

# Visitor types that always get into session_reserved (no registration needed)
_SESSION_RESERVED_FREE_PASS = frozenset({"vip", "organizer"})

# Zone → DB scan_type enum value
ZONE_TO_SCAN_TYPE: dict[str, str] = {
    "entry_general":    "entry",
    "lounge_vip":       "lounge",
    "lounge_press":     "lounge",
    "restaurant":       "restaurant",
    "session_general":  "session",
    "session_reserved": "session",
    "backstage":        "entry",
}


# ── Main validation function ───────────────────────────────────────────────────

async def validate_scan(
    db: AsyncSession,
    qr_data: str,
    zone: str,
    device_id: Optional[str],
) -> dict:
    """
    Validate a QR scan and record access if authorised.

    Returns:
        dict with keys: valid (bool), message (str),
        and on success: visitor, ticket_code, zone, scanned_at
    """

    # ── 1. Parse QR format ────────────────────────────────────────────────────
    try:
        parsed = parse_qr_data(qr_data)
    except ValueError as exc:
        return _reject(str(exc))

    ticket_code = parsed["ticket_code"]

    # ── 2. Lookup ticket ──────────────────────────────────────────────────────
    t_result = await db.execute(
        select(Ticket).where(Ticket.code == ticket_code)
    )
    ticket: Optional[Ticket] = t_result.scalar_one_or_none()

    if ticket is None:
        return _reject("Ticket not found")

    # ── 3. Ticket must be confirmed ───────────────────────────────────────────
    if ticket.status != "confirmed":
        return _reject(f"Ticket is '{ticket.status}' — only confirmed tickets are accepted")

    # ── 4. Load visitor ───────────────────────────────────────────────────────
    v_result = await db.execute(
        select(Visitor).where(Visitor.id == ticket.visitor_id)
    )
    visitor: Optional[Visitor] = v_result.scalar_one_or_none()

    if visitor is None:
        return _reject("Visitor record not found")

    # ── 5. Load event & verify dates ──────────────────────────────────────────
    e_result = await db.execute(
        select(Event).where(Event.id == ticket.event_id)
    )
    event: Optional[Event] = e_result.scalar_one_or_none()

    if event is None:
        return _reject("Event not found")

    today = date.today()
    if today < event.start_date or today > event.end_date:
        return _reject(
            f"Access denied: event runs {event.start_date} – {event.end_date}, "
            f"today is {today}"
        )

    # ── 6. Zone access check ──────────────────────────────────────────────────
    visitor_type = visitor.type

    if zone == "session_reserved":
        if visitor_type not in _SESSION_RESERVED_FREE_PASS:
            # Check session registration for this event
            reg_result = await db.execute(
                select(SessionAttendance)
                .join(
                    # Import here to avoid circular at module level
                    __import__(
                        "app.models.session",
                        fromlist=["Session"],
                    ).Session,
                    SessionAttendance.session_id
                    == __import__(
                        "app.models.session",
                        fromlist=["Session"],
                    ).Session.id,
                )
                .where(
                    SessionAttendance.visitor_id == visitor.id,
                    __import__(
                        "app.models.session",
                        fromlist=["Session"],
                    ).Session.event_id
                    == event.id,
                )
            )
            if reg_result.scalar_one_or_none() is None:
                return _reject(
                    f"Access denied: {visitor_type} requires session registration for reserved zones"
                )
    else:
        allowed = ZONE_ACCESS.get(zone)
        if allowed is None:
            return _reject(f"Unknown zone '{zone}'")
        if visitor_type not in allowed:
            return _reject(
                f"Access denied: '{visitor_type}' is not permitted in zone '{zone}'"
            )

    # ── 7. Create QRScan record ────────────────────────────────────────────────
    scan_type = ZONE_TO_SCAN_TYPE.get(zone, "entry")
    now       = datetime.now(timezone.utc)

    scan = QRScan(
        ticket_id=ticket.id,
        visitor_id=visitor.id,
        event_id=ticket.event_id,
        scan_type=scan_type,
        zone=zone,
        device_id=device_id,
        scanned_at=now,
    )
    db.add(scan)
    await db.flush()
    await db.refresh(scan)

    # ── 8. Publish to Redis (fire-and-forget) ─────────────────────────────────
    await _publish_scan_event(
        event_id=str(ticket.event_id),
        scan=scan,
        visitor=visitor,
        db=db,
    )

    visitor_info = {
        "id":      str(visitor.id),
        "name":    f"{visitor.first_name} {visitor.last_name}",
        "type":    visitor.type,
        "company": visitor.company,
    }

    return {
        "valid":       True,
        "message":     "Access granted",
        "visitor":     visitor_info,
        "ticket_code": ticket.code,
        "zone":        zone,
        "scanned_at":  now.isoformat(),
    }


# ── Stats ──────────────────────────────────────────────────────────────────────

async def get_stats(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """
    Aggregate scan statistics for one event:
      - total_scans
      - unique_visitors
      - entries_by_hour  {"09:00": 45, "10:00": 120, ...}
      - entries_by_zone  {"entry_general": 300, ...}
      - entries_by_type  {"vip": 50, "standard": 250, ...}
    """
    from sqlalchemy import cast, String

    # Total scans
    total_q = await db.execute(
        select(func.count(QRScan.id)).where(QRScan.event_id == event_id)
    )
    total_scans: int = total_q.scalar() or 0

    # Unique visitors
    unique_q = await db.execute(
        select(func.count(func.distinct(QRScan.visitor_id))).where(
            QRScan.event_id == event_id
        )
    )
    unique_visitors: int = unique_q.scalar() or 0

    # Entries by hour (SQLite-compatible — extract hour from scanned_at)
    hour_rows = await db.execute(
        select(
            func.strftime("%H", QRScan.scanned_at).label("hour"),
            func.count(QRScan.id).label("cnt"),
        )
        .where(QRScan.event_id == event_id)
        .group_by(func.strftime("%H", QRScan.scanned_at))
    )
    entries_by_hour = {
        f"{row.hour}:00": row.cnt for row in hour_rows if row.hour is not None
    }

    # Entries by zone
    zone_rows = await db.execute(
        select(QRScan.zone, func.count(QRScan.id).label("cnt"))
        .where(QRScan.event_id == event_id)
        .group_by(QRScan.zone)
    )
    entries_by_zone = {
        (row.zone or "unknown"): row.cnt for row in zone_rows
    }

    # Entries by visitor type (join with Visitor)
    type_rows = await db.execute(
        select(Visitor.type, func.count(QRScan.id).label("cnt"))
        .join(Visitor, QRScan.visitor_id == Visitor.id)
        .where(QRScan.event_id == event_id)
        .group_by(Visitor.type)
    )
    entries_by_type = {row.type: row.cnt for row in type_rows}

    return {
        "event_id":        event_id,
        "total_scans":     total_scans,
        "unique_visitors": unique_visitors,
        "entries_by_hour": entries_by_hour,
        "entries_by_zone": entries_by_zone,
        "entries_by_type": entries_by_type,
    }


async def get_live_count(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """
    Estimate current venue occupancy:
      entries_today = entry_general scans today
      visitors_online ≈ entries_today (no exit tracking yet)
    """
    today_str = date.today().isoformat()

    entries_q = await db.execute(
        select(func.count(func.distinct(QRScan.visitor_id))).where(
            QRScan.event_id == event_id,
            QRScan.zone == "entry_general",
            func.strftime("%Y-%m-%d", QRScan.scanned_at) == today_str,
        )
    )
    entries_today: int = entries_q.scalar() or 0

    return {
        "event_id":        event_id,
        "entries_today":   entries_today,
        "visitors_online": entries_today,
        "last_updated":    datetime.now(timezone.utc),
    }


async def get_history(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    zone: Optional[str],
    scan_date: Optional[date],
    page: int,
    limit: int,
) -> list[QRScan]:
    """Return paginated scan history with optional filters."""
    query = select(QRScan)

    if event_id:
        query = query.where(QRScan.event_id == event_id)
    if zone:
        query = query.where(QRScan.zone == zone)
    if scan_date:
        date_str = scan_date.isoformat()
        query = query.where(
            func.strftime("%Y-%m-%d", QRScan.scanned_at) == date_str
        )

    query = (
        query
        .order_by(QRScan.scanned_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


# ── Internal helpers ──────────────────────────────────────────────────────────

def _reject(message: str) -> dict:
    return {"valid": False, "message": message, "visitor": None, "ticket_code": None}


async def _publish_scan_event(
    event_id: str,
    scan: QRScan,
    visitor: Visitor,
    db: AsyncSession,
) -> None:
    """
    Publish a scan event to Redis channel scans:{event_id}.
    Errors are swallowed so a Redis outage never blocks check-ins.
    """
    try:
        from app.core.config import settings
        import redis.asyncio as aioredis

        # Build live-count context
        today_str = date.today().isoformat()
        entries_q = await db.execute(
            select(func.count(func.distinct(QRScan.visitor_id))).where(
                QRScan.event_id == scan.event_id,
                QRScan.zone == "entry_general",
                func.strftime("%Y-%m-%d", QRScan.scanned_at) == today_str,
            )
        )
        entries_today: int = entries_q.scalar() or 0

        payload = {
            "type":            "scan",
            "scan_type":       scan.scan_type,
            "zone":            scan.zone,
            "visitor_type":    visitor.type,
            "visitor_name":    f"{visitor.first_name} {visitor.last_name}",
            "timestamp":       scan.scanned_at.isoformat(),
            "entries_today":   entries_today,
            "visitors_online": entries_today,
        }

        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.publish(f"scans:{event_id}", json.dumps(payload))
        await r.aclose()

    except Exception:
        # Redis is optional — never let it break scan validation
        pass
