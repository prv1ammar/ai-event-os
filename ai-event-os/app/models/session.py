"""
app/models/session.py
─────────────────────
Conference sessions and speakers.
"""

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

SessionType = Enum(
    "keynote", "panel", "workshop", "roundtable", "networking", "demo",
    name="session_type_enum",
)


class Session(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "sessions"

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    session_type = Column(SessionType, nullable=False, default="keynote")
    room = Column(String(120), nullable=True)
    capacity = Column(Integer, nullable=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)

    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event = relationship("Event", back_populates="sessions")
    speakers = relationship("Speaker", secondary="session_speakers", back_populates="sessions")

    def __repr__(self) -> str:
        return f"<Session {self.title!r} type={self.session_type}>"


class Speaker(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "speakers"

    first_name = Column(String(120), nullable=False)
    last_name = Column(String(120), nullable=False)
    company = Column(String(255), nullable=True)
    bio = Column(Text, nullable=True)
    expertise = Column(String(255), nullable=True)
    linkedin_url = Column(String(512), nullable=True)
    photo_url = Column(String(512), nullable=True)

    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event = relationship("Event", back_populates="speakers")
    sessions = relationship("Session", secondary="session_speakers", back_populates="speakers")

    def __repr__(self) -> str:
        return f"<Speaker {self.first_name} {self.last_name}>"


# ── Many-to-many association table ────────────────────────────────────────────
from sqlalchemy import Table

session_speakers = Table(
    "session_speakers",
    Base.metadata,
    Column(
        "session_id",
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "speaker_id",
        UUID(as_uuid=True),
        ForeignKey("speakers.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
