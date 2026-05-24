"""
app/services/qr_service.py
──────────────────────────
QR code generation and parsing for AI EVENT OS tickets.

QR data format:
    AIEVENT-{event_id_hex32}-{visitor_id_hex32}-{ticket_code}

Where:
  * event_id_hex32   — UUID without dashes (32 hex chars)
  * visitor_id_hex32 — UUID without dashes (32 hex chars)
  * ticket_code      — alphanumeric, NO dashes (e.g. TK4A9BF21C30)

This format always produces exactly 4 dash-separated tokens, which makes
parsing unambiguous even though UUIDs contain their own dashes.
"""

from __future__ import annotations

import io
import uuid

import qrcode
import qrcode.constants
from PIL import Image

# ── QR generation ─────────────────────────────────────────────────────────────

def build_qr_payload(
    event_id: str | uuid.UUID,
    visitor_id: str | uuid.UUID,
    ticket_code: str,
) -> str:
    """
    Compose the canonical QR string for a ticket.

    Uses dash-free UUID hex to keep exactly 4 "-" separated segments.
    """
    e_hex = str(event_id).replace("-", "")
    v_hex = str(visitor_id).replace("-", "")
    return f"AIEVENT-{e_hex}-{v_hex}-{ticket_code}"


def generate_qr_code(
    ticket_code: str,
    event_id: str | uuid.UUID,
    visitor_id: str | uuid.UUID,
) -> bytes:
    """
    Generate a QR code PNG for the given ticket.

    Returns raw PNG bytes suitable for direct HTTP response or PDF embedding.

    Args:
        ticket_code: Unique ticket code (no dashes).
        event_id:    Event UUID or string.
        visitor_id:  Visitor UUID or string.

    Returns:
        PNG image as bytes.
    """
    qr_data = build_qr_payload(event_id, visitor_id, ticket_code)

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_data)
    qr.make(fit=True)

    img: Image.Image = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


# ── QR parsing ────────────────────────────────────────────────────────────────

def parse_qr_data(qr_data: str) -> dict:
    """
    Parse and validate a QR scan string.

    Expected format:
        AIEVENT-{event_id_hex32}-{visitor_id_hex32}-{ticket_code}

    Returns:
        dict with keys: event_id (UUID str), visitor_id (UUID str), ticket_code

    Raises:
        ValueError: if the format is invalid or the hex IDs are malformed.
    """
    qr_data = qr_data.strip()
    parts = qr_data.split("-")

    # Must be exactly 4 segments; first must be literal "AIEVENT"
    if len(parts) != 4 or parts[0] != "AIEVENT":
        raise ValueError(
            "Invalid QR format — expected AIEVENT-{event_hex}-{visitor_hex}-{code}"
        )

    e_hex, v_hex, ticket_code = parts[1], parts[2], parts[3]

    # Validate hex lengths (32 chars = UUID without dashes)
    if len(e_hex) != 32 or not _is_hex(e_hex):
        raise ValueError(f"Malformed event_id hex: '{e_hex}'")
    if len(v_hex) != 32 or not _is_hex(v_hex):
        raise ValueError(f"Malformed visitor_id hex: '{v_hex}'")
    if not ticket_code:
        raise ValueError("Missing ticket_code in QR data")

    return {
        "event_id": _hex_to_uuid_str(e_hex),
        "visitor_id": _hex_to_uuid_str(v_hex),
        "ticket_code": ticket_code,
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _is_hex(s: str) -> bool:
    try:
        int(s, 16)
        return True
    except ValueError:
        return False


def _hex_to_uuid_str(hex32: str) -> str:
    """Reformat a 32-char hex string back to standard UUID notation."""
    return str(uuid.UUID(hex32))
