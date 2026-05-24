"""
app/models/event.py
───────────────────
Core Event entity — the parent container for everything else.
"""

from sqlalchemy import Column, Date, Enum, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

EventStatus = Enum(
    "draft", "published", "ongoing", "completed", "cancelled",
    name="event_status_enum",
)


class Event(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "events"

    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    venue = Column(String(255), nullable=True)
    city = Column(String(120), nullable=True)
    country = Column(String(100), nullable=True, default="Morocco")
    capacity = Column(Integer, nullable=True)
    status = Column(EventStatus, nullable=False, default="draft")
    category = Column(String(120), nullable=True)   # e.g. Tech / Trade Show / Conference
    budget = Column(Integer, nullable=True)          # MAD
    logo_url = Column(String(512), nullable=True)

    # ── Relationships ──────────────────────────────────────────────────────────
    users = relationship("User", back_populates="event", foreign_keys="User.event_id")
    exhibitors = relationship("Exhibitor", back_populates="event", cascade="all, delete-orphan")
    booths = relationship("Booth", back_populates="event", cascade="all, delete-orphan")
    visitors = relationship("Visitor", back_populates="event", cascade="all, delete-orphan")
    tickets = relationship("Ticket", back_populates="event", cascade="all, delete-orphan")
    qr_scans = relationship("QRScan", back_populates="event", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="event", cascade="all, delete-orphan")
    speakers = relationship("Speaker", back_populates="event", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="event", cascade="all, delete-orphan")
    meetings = relationship("Meeting", back_populates="event", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="event", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="event", cascade="all, delete-orphan")
    budget_categories = relationship(
        "BudgetCategory", back_populates="event", cascade="all, delete-orphan"
    )
    expenses = relationship("Expense", back_populates="event", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="event", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Event {self.name!r} status={self.status}>"
