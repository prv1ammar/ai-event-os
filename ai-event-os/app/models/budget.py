"""
app/models/budget.py
────────────────────
Budget categories and individual expense records (dépenses) per event.
All amounts stored in MAD (Moroccan Dirham).
"""

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

ExpenseStatus = Enum(
    "pending", "paid", "cancelled",
    name="expense_status_enum",
)

BUDGET_CATEGORY_CHOICES = [
    "Logistique",     # transport, manutention, stockage
    "Communication",  # print, signalétique, médias
    "Technique",      # écrans, audio, réseau, LED
    "Marketing",      # digital, réseaux sociaux, emailing
    "Restauration",   # cocktail, repas VIP, pauses café
    "Divers",         # sécurité, nettoyage, assurance
]


class BudgetCategory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "budget_categories"

    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(120), nullable=False)       # Logistique, Communication, …
    budget_mad = Column(Integer, nullable=False, default=0)  # allocated budget in MAD

    # ── Relationships ──────────────────────────────────────────────────────────
    event = relationship("Event", back_populates="budget_categories")
    expenses = relationship(
        "Expense", back_populates="category", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<BudgetCategory {self.name!r} budget={self.budget_mad} MAD>"


class Expense(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "expenses"

    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id = Column(
        UUID(as_uuid=True),
        ForeignKey("budget_categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description = Column(String(512), nullable=False)
    amount_mad = Column(Integer, nullable=False)
    status = Column(ExpenseStatus, nullable=False, default="pending")
    vendor = Column(String(255), nullable=True)
    invoice_ref = Column(String(120), nullable=True)
    notes = Column(Text, nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    # ── Relationships ──────────────────────────────────────────────────────────
    category = relationship("BudgetCategory", back_populates="expenses")
    event = relationship("Event", back_populates="expenses")

    def __repr__(self) -> str:
        return f"<Expense {self.description!r} {self.amount_mad} MAD status={self.status}>"
