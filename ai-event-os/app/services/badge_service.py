"""
app/services/badge_service.py
──────────────────────────────
Badge PDF generation using ReportLab + Pillow.

Badge layout (A6 portrait — 105 mm × 148 mm):
  ┌──────────────────────────────┐  ← coloured top band (event name)
  │  ████  AI EVENT OS  ████     │
  │  Conference & Exhibition     │
  ├──────────────────────────────┤
  │                              │
  │       AHMED BENALI           │  ← visitor full name (large, bold)
  │                              │
  │      TechCorp Solutions      │  ← company
  │    Lead Software Engineer    │  ← role/title
  │                              │
  ├──────────────────────────────┤
  │         ▐▌ VIP ▐▌            │  ← coloured type band
  ├──────────────────────────────┤
  │                              │
  │       ┌──────────┐           │
  │       │  QR CODE │           │  ← QR code centred
  │       └──────────┘           │
  │      TK4A9BF21C30            │  ← ticket code (monospace)
  └──────────────────────────────┘

Colour palette (border + type band) per visitor type:
  vip       → gold    #FFD700 / #000000 text
  press     → green   #27AE60 / #FFFFFF text
  standard  → blue    #2980B9 / #FFFFFF text
  partner   → purple  #8E44AD / #FFFFFF text
  organizer → red     #E74C3C / #FFFFFF text
  speaker   → orange  #E67E22 / #FFFFFF text
  exhibitor → teal    #1ABC9C / #FFFFFF text  (future type)
"""

from __future__ import annotations

import io
from typing import Any

from PIL import Image as PILImage
from reportlab.lib.pagesizes import A6
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

# ── Colour palette ─────────────────────────────────────────────────────────────

BADGE_COLORS: dict[str, dict[str, str]] = {
    "vip":        {"border": "#FFD700", "band_bg": "#FFD700", "band_text": "#000000"},
    "press":      {"border": "#27AE60", "band_bg": "#27AE60", "band_text": "#FFFFFF"},
    "standard":   {"border": "#2980B9", "band_bg": "#2980B9", "band_text": "#FFFFFF"},
    "partner":    {"border": "#8E44AD", "band_bg": "#8E44AD", "band_text": "#FFFFFF"},
    "organizer":  {"border": "#E74C3C", "band_bg": "#E74C3C", "band_text": "#FFFFFF"},
    "speaker":    {"border": "#E67E22", "band_bg": "#E67E22", "band_text": "#FFFFFF"},
    "exhibitor":  {"border": "#1ABC9C", "band_bg": "#1ABC9C", "band_text": "#FFFFFF"},
}

_DEFAULT_COLORS = {"border": "#95A5A6", "band_bg": "#95A5A6", "band_text": "#FFFFFF"}


# ── Public API ─────────────────────────────────────────────────────────────────

def generate_badge_pdf(
    visitor: Any,
    ticket: Any,
    event: Any,
    qr_bytes: bytes,
) -> bytes:
    """
    Render a single visitor badge as a PDF in A6 portrait format.

    Args:
        visitor:   ORM Visitor object (or any object with the same attrs).
        ticket:    ORM Ticket object.
        event:     ORM Event object.
        qr_bytes:  QR code PNG as raw bytes.

    Returns:
        PDF file as bytes.
    """
    palette = BADGE_COLORS.get(
        getattr(visitor, "type", "standard"), _DEFAULT_COLORS
    )

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A6)
    w, h = A6  # ≈ 297.6 pt × 419.5 pt

    _draw_border(c, w, h, palette["border"])
    _draw_header_band(c, w, h, palette, event)
    _draw_visitor_name(c, w, h, visitor)
    _draw_company_role(c, w, h, visitor)
    _draw_type_band(c, w, h, palette, visitor)
    _draw_qr(c, w, h, qr_bytes)
    _draw_ticket_code(c, w, ticket)

    c.showPage()
    c.save()
    return buffer.getvalue()


def get_badge_preview_colors(visitor_type: str) -> dict:
    """Return the colour palette for a given visitor type (preview endpoint)."""
    return BADGE_COLORS.get(visitor_type, _DEFAULT_COLORS)


# ── Drawing helpers ────────────────────────────────────────────────────────────

def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """Convert #RRGGBB to (r, g, b) with values in [0.0, 1.0]."""
    h = hex_color.lstrip("#")
    return (
        int(h[0:2], 16) / 255.0,
        int(h[2:4], 16) / 255.0,
        int(h[4:6], 16) / 255.0,
    )


def _draw_border(c: canvas.Canvas, w: float, h: float, color_hex: str) -> None:
    """Draw a thick coloured border around the whole badge."""
    r, g, b = _hex_to_rgb(color_hex)
    c.setStrokeColorRGB(r, g, b)
    c.setLineWidth(5)
    c.rect(2.5, 2.5, w - 5, h - 5, stroke=1, fill=0)


def _draw_header_band(
    c: canvas.Canvas,
    w: float,
    h: float,
    palette: dict,
    event: Any,
) -> None:
    """Coloured top band with event title."""
    band_height = 58
    band_y = h - band_height

    r, g, b = _hex_to_rgb(palette["band_bg"])
    c.setFillColorRGB(r, g, b)
    c.rect(0, band_y, w, band_height, stroke=0, fill=1)

    tr, tg, tb = _hex_to_rgb(palette["band_text"])
    c.setFillColorRGB(tr, tg, tb)

    # Platform name
    c.setFont("Helvetica-Bold", 17)
    c.drawCentredString(w / 2, h - 26, "AI EVENT OS")

    # Event name (truncated to fit)
    event_name = str(getattr(event, "name", "Event"))[:44]
    c.setFont("Helvetica", 9)
    c.drawCentredString(w / 2, h - 42, event_name)

    # Venue / city
    venue = getattr(event, "venue", None) or ""
    city  = getattr(event, "city", None)  or ""
    location = f"{venue}  •  {city}".strip(" •") if (venue or city) else ""
    if location:
        c.setFont("Helvetica-Oblique", 8)
        c.drawCentredString(w / 2, h - 54, location[:50])


def _draw_visitor_name(
    c: canvas.Canvas, w: float, h: float, visitor: Any
) -> None:
    """Large bold visitor name — splits onto two lines if too long."""
    first = str(getattr(visitor, "first_name", "")).upper()
    last  = str(getattr(visitor, "last_name",  "")).upper()
    full  = f"{first} {last}"

    c.setFillColorRGB(0.1, 0.1, 0.1)

    if len(full) <= 20:
        c.setFont("Helvetica-Bold", 26)
        c.drawCentredString(w / 2, h - 110, full)
    elif len(full) <= 30:
        c.setFont("Helvetica-Bold", 21)
        c.drawCentredString(w / 2, h - 108, full)
    else:
        # Two lines
        c.setFont("Helvetica-Bold", 19)
        c.drawCentredString(w / 2, h - 100, first[:25])
        c.drawCentredString(w / 2, h - 122, last[:25])


def _draw_company_role(
    c: canvas.Canvas, w: float, h: float, visitor: Any
) -> None:
    """Company and role lines below the name."""
    company = str(getattr(visitor, "company", None) or "")
    role    = str(getattr(visitor, "role",    None) or "")

    c.setFillColorRGB(0.3, 0.3, 0.3)

    if company:
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(w / 2, h - 147, company[:40])

    if role:
        c.setFont("Helvetica-Oblique", 10)
        c.drawCentredString(w / 2, h - 162, role[:40])


def _draw_type_band(
    c: canvas.Canvas,
    w: float,
    h: float,
    palette: dict,
    visitor: Any,
) -> None:
    """Coloured horizontal band with the visitor-type label."""
    band_h  = 32
    band_y  = h - 215

    r, g, b = _hex_to_rgb(palette["band_bg"])
    c.setFillColorRGB(r, g, b)
    c.rect(0, band_y, w, band_h, stroke=0, fill=1)

    tr, tg, tb = _hex_to_rgb(palette["band_text"])
    c.setFillColorRGB(tr, tg, tb)
    c.setFont("Helvetica-Bold", 15)

    label = str(getattr(visitor, "type", "VISITOR")).upper()
    c.drawCentredString(w / 2, band_y + 10, label)


def _draw_qr(c: canvas.Canvas, w: float, h: float, qr_bytes: bytes) -> None:
    """Embed the QR code image, centred in the lower portion of the badge."""
    qr_size = 128
    qr_x = (w - qr_size) / 2
    qr_y = 70   # from bottom of page

    qr_pil = PILImage.open(io.BytesIO(qr_bytes)).convert("RGB")
    qr_reader = ImageReader(qr_pil)
    c.drawImage(qr_reader, qr_x, qr_y, qr_size, qr_size, mask="auto")


def _draw_ticket_code(c: canvas.Canvas, w: float, ticket: Any) -> None:
    """Render the ticket code in small monospace font at the very bottom."""
    code = str(getattr(ticket, "code", ""))
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.setFont("Courier", 9)
    c.drawCentredString(w / 2, 52, code)

    # Thin separator line above code
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(0.5)
    c.line(20, 62, w - 20, 62)
