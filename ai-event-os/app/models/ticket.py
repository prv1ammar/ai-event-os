"""
app/models/ticket.py
────────────────────
Tickets and QR scan events.
"""

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

TicketStatus = Enum(
    "confirmed", "pending", "cancelled", "no_show",
    name="ticket_status_enum",
)

ScanType = Enum(
    "entry", "session", "lounge", "restaurant", "booth",
    name="scan_type_enum",
)


class Ticket(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tickets"

    code = Column(String(100), unique=True, nullable=False, index=True)   # unique ticket code
    pack = Column(String(80), nullable=True)                               # ticket pack/tier
    status = Column(TicketStatus, nullable=False, default="pending")
    qr_data = Column(Text, nullable=True)                                  # base64 QR image or JSON

    visitor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("visitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    visitor = relationship("Visitor", back_populates="tickets")
    event = relationship("Event", back_populates="tickets")
    qr_scans = relationship("QRScan", back_populates="ticket", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Ticket {self.code} status={self.status}>"


class QRScan(Base, UUIDMixin):
    """Log every QR scan — no updated_at needed, scans are immutable."""

    __tablename__ = "qr_scans"

    ticket_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    visitor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("visitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scan_type = Column(ScanType, nullable=False, default="entry")
    zone = Column(String(120), nullable=True)
    device_id = Column(String(120), nullable=True)
    scanned_at = Column(DateTime(timezone=True), nullable=False)

    ticket = relationship("Ticket", back_populates="qr_scans")
    visitor = relationship("Visitor", back_populates="qr_scans")
    event = relationship("Event", back_populates="qr_scans")

    def __repr__(self) -> str:
        return f"<QRScan ticket={self.ticket_id} type={self.scan_type}>"
