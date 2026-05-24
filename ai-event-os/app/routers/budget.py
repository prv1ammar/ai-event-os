"""
app/routers/budget.py
─────────────────────
Budget management endpoints.

GET    /api/v1/budget/{event_id}             full budget overview (categories + expenses)
POST   /api/v1/budget/category               create a budget category for an event
GET    /api/v1/budget/{event_id}/variance    variance report (budget vs. actual)
GET    /api/v1/budget/{event_id}/forecast    projected final spend
POST   /api/v1/budget/expense               add an expense (dépense)
PUT    /api/v1/budget/expense/{id}           update an expense
DELETE /api/v1/budget/expense/{id}          soft-delete (cancel) an expense
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.budget import (
    BudgetCategoryCreate,
    BudgetCategoryResponse,
    BudgetForecast,
    BudgetOverview,
    BudgetVarianceItem,
    ExpenseCreate,
    ExpenseResponse,
    ExpenseUpdate,
)
from app.services import budget_service

router = APIRouter(prefix="/api/v1/budget", tags=["Budget"])


# ── GET /api/v1/budget/{event_id} ─────────────────────────────────────────────

@router.get(
    "/{event_id}",
    response_model=BudgetOverview,
    summary="Full budget overview: all categories + all expenses for an event",
)
async def get_budget_overview(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await budget_service.get_budget_overview(db, event_id)


# ── POST /api/v1/budget/category ──────────────────────────────────────────────

@router.post(
    "/category",
    response_model=BudgetCategoryResponse,
    status_code=201,
    summary="Create a budget category for an event",
)
async def create_budget_category(
    data: BudgetCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Allowed category names:
    Logistique | Communication | Technique | Marketing | Restauration | Divers
    """
    return await budget_service.create_budget_category(db, data)


# ── GET /api/v1/budget/{event_id}/variance ────────────────────────────────────

@router.get(
    "/{event_id}/variance",
    response_model=list[BudgetVarianceItem],
    summary="Budget vs. actual variance report per category",
)
async def get_variance_report(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Returns per-category variance rows.
    variance_mad > 0 → under budget (good).
    variance_mad < 0 → over budget (alert).
    """
    return await budget_service.get_variance_report(db, event_id)


# ── GET /api/v1/budget/{event_id}/forecast ────────────────────────────────────

@router.get(
    "/{event_id}/forecast",
    response_model=BudgetForecast,
    summary="Projected final budget (committed × 1.10 contingency)",
)
async def get_budget_forecast(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await budget_service.get_forecast(db, event_id)


# ── POST /api/v1/budget/expense ───────────────────────────────────────────────

@router.post(
    "/expense",
    response_model=ExpenseResponse,
    status_code=201,
    summary="Add an expense (dépense) to an event's budget",
)
async def add_expense(
    data: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Amount must be in MAD (positive integer).
    category_id must belong to the same event_id.
    Initial status is **pending**.
    """
    return await budget_service.add_expense(db, data)


# ── PUT /api/v1/budget/expense/{id} ───────────────────────────────────────────

@router.put(
    "/expense/{expense_id}",
    response_model=ExpenseResponse,
    summary="Update an expense",
)
async def update_expense(
    expense_id: UUID,
    data: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    return await budget_service.update_expense(db, expense_id, data)


# ── DELETE /api/v1/budget/expense/{id} ────────────────────────────────────────

@router.delete(
    "/expense/{expense_id}",
    summary="Soft-delete (cancel) an expense",
)
async def delete_expense(
    expense_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """Sets the expense status to **cancelled** — the row is preserved for audit."""
    return await budget_service.delete_expense(db, expense_id)
