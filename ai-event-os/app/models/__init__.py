"""
app/models/__init__.py
──────────────────────
Import every model so Alembic autogenerate sees the complete metadata tree.
Order matters: parent tables before child tables.
"""

from app.models.base import Base, TimestampMixin, UUIDMixin  # noqa: F401

# ── Independent / top-level ───────────────────────────────────────────────────
from app.models.event import Event  # noqa: F401
from app.models.user import User  # noqa: F401

# ── Event children ────────────────────────────────────────────────────────────
from app.models.exhibitor import Exhibitor  # noqa: F401
from app.models.booth import Booth, BoothReservation  # noqa: F401
from app.models.visitor import Visitor  # noqa: F401
from app.models.ticket import Ticket, QRScan  # noqa: F401
from app.models.session import Session, Speaker, session_speakers  # noqa: F401
from app.models.lead import Lead, Meeting  # noqa: F401
from app.models.payment import Payment  # noqa: F401
from app.models.campaign import Campaign  # noqa: F401
from app.models.session_attendance import SessionAttendance  # noqa: F401
from app.models.landing_page import LandingPage, LandingPageVisit  # noqa: F401

# ── Finance module ────────────────────────────────────────────────────────────
from app.models.budget import BudgetCategory, Expense  # noqa: F401
from app.models.invoice import Invoice  # noqa: F401

__all__ = [
    "Base",
    "TimestampMixin",
    "UUIDMixin",
    "Event",
    "User",
    "Exhibitor",
    "Booth",
    "BoothReservation",
    "Visitor",
    "Ticket",
    "QRScan",
    "Session",
    "Speaker",
    "session_speakers",
    "Lead",
    "Meeting",
    "Payment",
    "Campaign",
    "SessionAttendance",
    "LandingPage",
    "LandingPageVisit",
    # Finance
    "BudgetCategory",
    "Expense",
    "Invoice",
]
