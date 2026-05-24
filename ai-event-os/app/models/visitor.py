"""
app/models/visitor.py
──────────────────────
Visitors registered for an event.
"""

from sqlalchemy import Column, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

VisitorType = Enum(
    "standard", "vip", "press", "partner", "organizer", "speaker",
    name="visitor_type_enum",
)


class Visitor(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "visitors"

    first_name = Column(String(120), nullable=False)
    last_name = Column(String(120), nullable=False)
    email = Column(String(320), nullable=False, index=True)
    phone = Column(String(30), nullable=True)
    company = Column(String(255), nullable=True)
    role = Column(String(120), nullable=True)          # job title
    type = Column(VisitorType, nullable=False, default="standard")
    country = Column(String(100), nullable=True, default="Morocco")

    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event = relationship("Event", back_populates="visitors")
    tickets = relationship("Ticket", back_populates="visitor", cascade="all, delete-orphan")
    qr_scans = relationship("QRScan", back_populates="visitor", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="visitor", cascade="all, delete-orphan")
    meetings = relationship("Meeting", back_populates="visitor", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Visitor {self.first_name} {self.last_name} type={self.type}>"
