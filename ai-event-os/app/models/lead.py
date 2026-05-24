"""
app/models/lead.py
──────────────────
Sales leads captured at the event + B2B meetings.
"""

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

LeadStatus = Enum(
    "new", "contacted", "qualified", "opportunity", "closed_won", "closed_lost",
    name="lead_status_enum",
)

MeetingStatus = Enum(
    "pending", "confirmed", "done", "cancelled",
    name="meeting_status_enum",
)


class Lead(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "leads"

    status = Column(LeadStatus, nullable=False, default="new")
    score = Column(Integer, nullable=True, default=0)     # 0-100 AI score
    notes = Column(Text, nullable=True)
    budget_range = Column(String(80), nullable=True)      # e.g. "100k-500k MAD"

    visitor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("visitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exhibitor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("exhibitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    visitor = relationship("Visitor", back_populates="leads")
    exhibitor = relationship("Exhibitor", back_populates="leads")
    event = relationship("Event", back_populates="leads")

    def __repr__(self) -> str:
        return f"<Lead status={self.status} score={self.score}>"


class Meeting(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meetings"

    scheduled_at = Column(DateTime(timezone=True), nullable=False)
    duration_min = Column(Integer, nullable=False, default=30)
    status = Column(MeetingStatus, nullable=False, default="pending")
    notes = Column(Text, nullable=True)

    visitor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("visitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exhibitor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("exhibitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    visitor = relationship("Visitor", back_populates="meetings")
    exhibitor = relationship("Exhibitor", back_populates="meetings")
    event = relationship("Event", back_populates="meetings")

    def __repr__(self) -> str:
        return f"<Meeting scheduled={self.scheduled_at} status={self.status}>"
