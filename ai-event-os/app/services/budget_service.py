"""
app/services/budget_service.py
───────────────────────────────
Budget category management and expense (dépense) tracking.

All monetary amounts are in MAD (Moroccan Dirham).
Variance  = budget_mad - spent_mad   (positive = under budget)
Forecast  = committed × 1.10         (10 % contingency buffer)
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import BudgetCategory, Expense
from app.schemas.budget import (
    BudgetCategoryCreate,
    BudgetForecast,
    BudgetOverview,
    BudgetVarianceItem,
    ExpenseCreate,
    ExpenseResponse,
    ExpenseUpdate,
)


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _get_category_or_404(
    db: AsyncSession, category_id: uuid.UUID
) -> BudgetCategory:
    result = await db.execute(
        select(BudgetCategory).where(BudgetCategory.id == category_id)
    )
    cat = result.scalar_one_or_none()
    if cat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Budget category {category_id} not found",
        )
    return cat


async def _get_expense_or_404(
    db: AsyncSession, expense_id: uuid.UUID
) -> Expense:
    result = await db.execute(
        select(Expense).where(Expense.id == expense_id)
    )
    exp = result.scalar_one_or_none()
    if exp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Expense {expense_id} not found",
        )
    return exp


async def _build_variance_items(
    db: AsyncSession,
    event_id: uuid.UUID,
    categories: list[BudgetCategory],
) -> tuple[list[BudgetVarianceItem], int, int]:
    """
    Returns (variance_items, total_budget_mad, total_spent_mad).
    Spent = sum of non-cancelled expenses per category.
    """
    spent_q = await db.execute(
        select(
            Expense.category_id,
            func.coalesce(func.sum(Expense.amount_mad), 0).label("spent"),
        )
        .where(Expense.event_id == event_id, Expense.status != "cancelled")
        .group_by(Expense.category_id)
    )
    spent_map: dict[str, int] = {
        str(row.category_id): int(row.spent) for row in spent_q
    }

    items: list[BudgetVarianceItem] = []
    total_budget = 0
    total_spent = 0

    for cat in categories:
        spent = spent_map.get(str(cat.id), 0)
        variance = cat.budget_mad - spent
        pct = round((variance / cat.budget_mad * 100), 1) if cat.budget_mad > 0 else 0.0
        total_budget += cat.budget_mad
        total_spent += spent
        items.append(
            BudgetVarianceItem(
                category=cat.name,
                budget_mad=cat.budget_mad,
                spent_mad=spent,
                variance_mad=variance,
                variance_pct=pct,
            )
        )

    return items, total_budget, total_spent


# ── BudgetCategory CRUD ────────────────────────────────────────────────────────

async def create_budget_category(
    db: AsyncSession, data: BudgetCategoryCreate
) -> BudgetCategory:
    # Prevent duplicate category names within the same event
    dup = await db.execute(
        select(BudgetCategory).where(
            BudgetCategory.event_id == data.event_id,
            BudgetCategory.name == data.name,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Budget category '{data.name}' already exists for this event",
        )

    cat = BudgetCategory(
        event_id=data.event_id,
        name=data.name,
        budget_mad=data.budget_mad,
    )
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


async def list_budget_categories(
    db: AsyncSession, event_id: uuid.UUID
) -> list[BudgetCategory]:
    result = await db.execute(
        select(BudgetCategory)
        .where(BudgetCategory.event_id == event_id)
        .order_by(BudgetCategory.name)
    )
    return list(result.scalars().all())


# ── Budget overview ────────────────────────────────────────────────────────────

async def get_budget_overview(
    db: AsyncSession, event_id: uuid.UUID
) -> BudgetOverview:
    cats_q = await db.execute(
        select(BudgetCategory).where(BudgetCategory.event_id == event_id)
    )
    categories = list(cats_q.scalars().all())

    variance_items, total_budget, total_spent = await _build_variance_items(
        db, event_id, categories
    )

    # Fetch all expenses for the event (for the detail table)
    expenses_q = await db.execute(
        select(Expense)
        .where(Expense.event_id == event_id)
        .order_by(Expense.created_at.desc())
    )
    expenses = list(expenses_q.scalars().all())

    return BudgetOverview(
        event_id=event_id,
        total_budget_mad=total_budget,
        total_spent_mad=total_spent,
        total_variance_mad=total_budget - total_spent,
        categories=variance_items,
        expenses=[ExpenseResponse.model_validate(e) for e in expenses],
    )


# ── Variance report ────────────────────────────────────────────────────────────

async def get_variance_report(
    db: AsyncSession, event_id: uuid.UUID
) -> list[BudgetVarianceItem]:
    cats_q = await db.execute(
        select(BudgetCategory).where(BudgetCategory.event_id == event_id)
    )
    categories = list(cats_q.scalars().all())
    items, _, _ = await _build_variance_items(db, event_id, categories)
    return items


# ── Forecast ───────────────────────────────────────────────────────────────────

async def get_forecast(
    db: AsyncSession, event_id: uuid.UUID
) -> BudgetForecast:
    """
    Linear forecast: project final spend as committed × 1.10 (10 % contingency).
    Capped at total budget so forecast never exceeds allocation.
    """
    cats_q = await db.execute(
        select(BudgetCategory).where(BudgetCategory.event_id == event_id)
    )
    categories = list(cats_q.scalars().all())
    items, total_budget, total_committed = await _build_variance_items(
        db, event_id, categories
    )

    forecast_final = min(int(total_committed * 1.10), total_budget) if total_budget > 0 else int(total_committed * 1.10)

    return BudgetForecast(
        event_id=event_id,
        total_budget_mad=total_budget,
        total_committed_mad=total_committed,
        forecast_final_mad=forecast_final,
        remaining_mad=total_budget - total_committed,
        categories=items,
    )


# ── Expense CRUD ───────────────────────────────────────────────────────────────

async def add_expense(db: AsyncSession, data: ExpenseCreate) -> Expense:
    # Verify category belongs to the same event
    cat = await _get_category_or_404(db, data.category_id)
    if str(cat.event_id) != str(data.event_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category does not belong to the specified event",
        )

    expense = Expense(
        event_id=data.event_id,
        category_id=data.category_id,
        description=data.description,
        amount_mad=data.amount_mad,
        vendor=data.vendor,
        invoice_ref=data.invoice_ref,
        notes=data.notes,
    )
    db.add(expense)
    await db.flush()
    await db.refresh(expense)
    return expense


async def update_expense(
    db: AsyncSession, expense_id: uuid.UUID, data: ExpenseUpdate
) -> Expense:
    expense = await _get_expense_or_404(db, expense_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(expense, field, value)
    await db.flush()
    await db.refresh(expense)
    return expense


async def delete_expense(db: AsyncSession, expense_id: uuid.UUID) -> dict:
    """Soft-delete: mark expense as 'cancelled' (preserves audit trail)."""
    expense = await _get_expense_or_404(db, expense_id)
    expense.status = "cancelled"
    await db.flush()
    return {"message": f"Expense '{expense.description}' has been cancelled"}
