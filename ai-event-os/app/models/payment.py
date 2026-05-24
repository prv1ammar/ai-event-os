"""
app/models/payment.py
─────────────────────
Financial transactions — all amounts in MAD.

source  : where the revenue comes from (stands / sponsoring / partenaires / inscriptions / other)
method  : how the payer settled (transfer / card / cash / cmi / cheque)
status  : lifecycle (pending → paid | partial | refunded | failed)
"""

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

PaymentMethod = Enum(
    "transfer", "card", "cash", "cmi", "cheque",
    name="payment_method_enum",
)

PaymentStatus = Enum(
    "paid", "partial", "pending", "refunded", "failed",
    name="payment_status_enum",
)

PayerType = Enum(
    "exhibitor", "visitor",
    name="payer_type_enum",
)

PaymentSource = Enum(
    "stands", "sponsoring", "partenaires", "inscriptions", "other",
    name="payment_source_enum",
)


class Payment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "payments"

    amount_mad = Column(Integer, nullable=False)                     # amount in MAD
    method = Column(PaymentMethod, nullable=False, default="transfer")
    status = Column(PaymentStatus, nullable=False, default="pending")
    source = Column(PaymentSource, nullable=False, default="other")  # revenue source
    reference = Column(String(120), nullable=True, unique=True)      # bank ref / receipt #
    payer_type = Column(PayerType, nullable=False)
    payer_id = Column(UUID(as_uuid=True), nullable=False)            # exhibitor or visitor UUID
    notes = Column(Text, nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Relationships ──────────────────────────────────────────────────────────
    event = relationship("Event", back_populates="payments")
    invoice = relationship(
        "Invoice", back_populates="payment", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Payment {self.amount_mad} MAD status={self.status} source={self.source}>"
