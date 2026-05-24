"""
app/schemas/budget.py
─────────────────────
Pydantic v2 schemas for budget categories and expense records.

Categories  : Logistique | Communication | Technique | Marketing | Restauration | Divers
All amounts : MAD (Moroccan Dirham)
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ── Constants ─────────────────────────────────────────────────────────────────

BUDGET_CATEGORIES: set[str] = {
    "Logistique",
    "Communication",
    "Technique",
    "Marketing",
    "Restauration",
    "Divers",
}

EXPENSE_STATUSES: set[str] = {"pending", "paid", "cancelled"}


# ── BudgetCategory schemas ─────────────────────────────────────────────────────

class BudgetCategoryCreate(BaseModel):
    event_id: UUID
    name: str = Field(..., description="Standard budget category name")
    budget_mad: int = Field(..., ge=0, description="Allocated budget in MAD")

    @field_validator("name")
    @classmethod
    def valid_category(cls, v: str) -> str:
        if v not in BUDGET_CATEGORIES:
            raise ValueError(f"name must be one of {sorted(BUDGET_CATEGORIES)}")
        return v


class BudgetCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_id: UUID
    name: str
    budget_mad: int
    created_at: datetime
    updated_at: datetime


# ── Expense schemas ────────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    event_id: UUID
    category_id: UUID
    description: str = Field(..., min_length=1, max_length=512)
    amount_mad: int = Field(..., gt=0, description="Expense amount in MAD")
    vendor: Optional[str] = Field(None, max_length=255)
    invoice_ref: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = None


class ExpenseUpdate(BaseModel):
    """All fields optional — PATCH-style partial update."""

    description: Optional[str] = Field(None, min_length=1, max_length=512)
    amount_mad: Optional[int] = Field(None, gt=0)
    status: Optional[str] = None
    vendor: Optional[str] = None
    invoice_ref: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in EXPENSE_STATUSES:
            raise ValueError(f"status must be one of {sorted(EXPENSE_STATUSES)}")
        return v


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_id: UUID
    category_id: UUID
    description: str
    amount_mad: int
    status: str
    vendor: Optional[str] = None
    invoice_ref: Optional[str] = None
    notes: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


# ── Aggregate / report schemas ─────────────────────────────────────────────────

class BudgetVarianceItem(BaseModel):
    """Per-category variance row (budget vs. actual)."""

    category: str
    budget_mad: int
    spent_mad: int
    variance_mad: int           # positive = under budget, negative = over budget
    variance_pct: float         # variance as % of budget


class BudgetOverview(BaseModel):
    """Full budget view for one event — categories + individual expenses."""

    event_id: UUID
    total_budget_mad: int
    total_spent_mad: int
    total_variance_mad: int
    categories: list[BudgetVarianceItem]
    expenses: list[ExpenseResponse]


class BudgetForecast(BaseModel):
    """Projected final budget based on current spend trajectory."""

    event_id: UUID
    total_budget_mad: int
    total_committed_mad: int
    forecast_final_mad: int     # committed * 1.10 (10 % contingency)
    remaining_mad: int
    categories: list[BudgetVarianceItem]
