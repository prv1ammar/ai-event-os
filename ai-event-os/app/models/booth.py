"""
app/models/booth.py
───────────────────
Physical booth slots inside a venue + their reservations.
"""

from sqlalchemy import Column, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

BoothStatus = Enum(
    "available", "reserved", "occupied",
    name="booth_status_enum",
)

ReservationStatus = Enum(
    "pending", "confirmed", "cancelled",
    name="reservation_status_enum",
)

PaymentStatus = Enum(
    "pending", "paid", "partial", "refunded",
    name="reservation_payment_status_enum",
)


class Booth(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "booths"

    number = Column(String(20), nullable=False)          # e.g. A45 / B12
    zone = Column(String(80), nullable=True)             # Hall A / Outdoor …
    size_m2 = Column(Float, nullable=True)
    price_mad = Column(Integer, nullable=False, default=0)  # MAD
    status = Column(BoothStatus, nullable=False, default="available")

    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event = relationship("Event", back_populates="booths")
    reservations = relationship("BoothReservation", back_populates="booth", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Booth {self.number} zone={self.zone} status={self.status}>"


class BoothReservation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "booth_reservations"

    booth_id = Column(
        UUID(as_uuid=True),
        ForeignKey("booths.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exhibitor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("exhibitors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    price_mad = Column(Integer, nullable=False, default=0)   # negotiated price in MAD
    package = Column(String(80), nullable=True)
    status = Column(ReservationStatus, nullable=False, default="pending")
    services = Column(JSONB, nullable=True, default=dict)    # extra services JSON
    payment_status = Column(PaymentStatus, nullable=False, default="pending")

    booth = relationship("Booth", back_populates="reservations")
    exhibitor = relationship("Exhibitor", back_populates="booth_reservations")

    def __repr__(self) -> str:
        return f"<BoothReservation booth={self.booth_id} exhibitor={self.exhibitor_id}>"
