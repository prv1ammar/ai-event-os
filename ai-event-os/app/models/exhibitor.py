"""
app/models/exhibitor.py
───────────────────────
Companies that exhibit at an event.
"""

from sqlalchemy import Column, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

ExhibitorStatus = Enum(
    "pending", "validated", "refused", "waiting_payment",
    name="exhibitor_status_enum",
)

ExhibitorPackage = Enum(
    "standard", "premium", "gold", "platinum",
    name="exhibitor_package_enum",
)

ExhibitorSize = Enum(
    "startup", "sme", "large", "multinational",
    name="exhibitor_size_enum",
)


class Exhibitor(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "exhibitors"

    company_name = Column(String(255), nullable=False)
    sector = Column(String(120), nullable=True)
    size = Column(ExhibitorSize, nullable=True)
    contact_name = Column(String(255), nullable=False)
    contact_email = Column(String(320), nullable=False, index=True)
    contact_phone = Column(String(30), nullable=True)
    country = Column(String(100), nullable=True, default="Morocco")
    website = Column(String(512), nullable=True)
    logo_url = Column(String(512), nullable=True)
    package = Column(ExhibitorPackage, nullable=True, default="standard")
    status = Column(ExhibitorStatus, nullable=False, default="pending")

    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Relationships ──────────────────────────────────────────────────────────
    event = relationship("Event", back_populates="exhibitors")
    booth_reservations = relationship("BoothReservation", back_populates="exhibitor", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="exhibitor", cascade="all, delete-orphan")
    meetings = relationship("Meeting", back_populates="exhibitor", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Exhibitor {self.company_name!r} status={self.status}>"
