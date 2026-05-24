"""
app/models/session_attendance.py
─────────────────────────────────
Association table that tracks visitor registrations for sessions.
One row per (session, visitor) pair.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin


class SessionAttendance(Base, UUIDMixin):
    """Records which visitors have registered for which sessions."""

    __tablename__ = "session_attendances"

    __table_args__ = (
        UniqueConstraint(
            "session_id", "visitor_id",
            name="uq_session_attendance",
        ),
    )

    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    visitor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("visitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    registered_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    session = relationship("Session", foreign_keys=[session_id])
    visitor = relationship("Visitor", foreign_keys=[visitor_id])

    def __repr__(self) -> str:
        return f"<SessionAttendance session={self.session_id} visitor={self.visitor_id}>"
