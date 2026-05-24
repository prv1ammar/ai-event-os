"""
app/models/invoice.py
─────────────────────
Invoice records linked one-to-one to a Payment.

Invoice number format : INV-{YYYY}-{MM}-{seq:04d}  (e.g. INV-2026-05-0001)
TVA rate              : 20 % — all amounts in MAD (Moroccan Dirham).
"""

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

InvoiceStatus = Enum(
    "draft", "sent", "paid", "overdue", "cancelled",
    name="invoice_status_enum",
)


class Invoice(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "invoices"

    # ── Identity ───────────────────────────────────────────────────────────────
    invoice_number = Column(String(30), nullable=False, unique=True, index=True)
    # e.g. INV-2026-05-0001

    # ── Foreign keys ──────────────────────────────────────────────────────────
    payment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("payments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Payer snapshot ────────────────────────────────────────────────────────
    # Stored at generation time so invoice is immutable even if payer changes.
    payer_name = Column(String(255), nullable=False)
    payer_email = Column(String(320), nullable=False)
    payer_company = Column(String(255), nullable=True)
    payer_ice = Column(String(30), nullable=True)      # Identifiant Commun Entreprise (ICE)
    payer_address = Column(Text, nullable=True)

    # ── Line item ─────────────────────────────────────────────────────────────
    description = Column(Text, nullable=False)

    # ── Amounts (MAD) ─────────────────────────────────────────────────────────
    amount_ht_mad = Column(Integer, nullable=False)     # Hors Taxes
    tva_rate = Column(Integer, nullable=False, default=20)
    tva_mad = Column(Integer, nullable=False)            # TVA amount
    amount_ttc_mad = Column(Integer, nullable=False)     # Toutes Taxes Comprises

    # ── Status & dates ────────────────────────────────────────────────────────
    status = Column(InvoiceStatus, nullable=False, default="draft")
    due_date = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    pdf_path = Column(String(512), nullable=True)

    # ── Relationships ──────────────────────────────────────────────────────────
    payment = relationship("Payment", back_populates="invoice")
    event = relationship("Event", back_populates="invoices")

    def __repr__(self) -> str:
        return f"<Invoice {self.invoice_number} {self.amount_ttc_mad} MAD status={self.status}>"
