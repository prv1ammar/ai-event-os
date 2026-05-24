"""
app/routers/payments.py
───────────────────────
Payment endpoints — all amounts in MAD (Moroccan Dirham).

GET    /api/v1/payments                        list with filters
POST   /api/v1/payments                        record payment manually
GET    /api/v1/payments/history/{payer_id}     all payments for a payer (exhibitor/visitor)
GET    /api/v1/payments/{id}                   payment detail
PUT    /api/v1/payments/{id}/status            update status
POST   /api/v1/payments/{id}/refund            initiate refund
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_organizer_or_admin, get_current_user
from app.schemas.payment import PaymentCreate, PaymentResponse, PaymentStatusUpdate, RefundRequest
from app.services import payment_service

router = APIRouter(prefix="/api/v1/payments", tags=["Payments"])


# ── GET /api/v1/payments ───────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[PaymentResponse],
    summary="List payments with optional filters",
)
async def list_payments(
    event_id: Optional[UUID] = Query(None, description="Filter by event UUID"),
    status: Optional[str] = Query(
        None, description="pending | paid | partial | refunded | failed"
    ),
    method: Optional[str] = Query(
        None, description="transfer | card | cash | cmi | cheque"
    ),
    payer_type: Optional[str] = Query(None, description="exhibitor | visitor"),
    source: Optional[str] = Query(
        None, description="stands | sponsoring | partenaires | inscriptions | other"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await payment_service.list_payments(
        db,
        event_id=event_id,
        payment_status=status,
        method=method,
        payer_type=payer_type,
        source=source,
        page=page,
        limit=limit,
    )


# ── POST /api/v1/payments ──────────────────────────────────────────────────────

@router.post(
    "",
    response_model=PaymentResponse,
    status_code=201,
    summary="Record a payment manually",
)
async def create_payment(
    data: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Create a new payment record.  Initial status is always **pending**.
    Amounts must be in MAD (integer, no decimals).
    """
    return await payment_service.create_payment(db, data)


# ── GET /api/v1/payments/history/{payer_id} ───────────────────────────────────
# NOTE: must be declared BEFORE /{id} to avoid route ambiguity.

@router.get(
    "/history/{payer_id}",
    response_model=list[PaymentResponse],
    summary="Payment history for a specific payer (exhibitor or visitor)",
)
async def get_payment_history(
    payer_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await payment_service.get_payment_history(db, payer_id, page=page, limit=limit)


# ── GET /api/v1/payments/{id} ─────────────────────────────────────────────────

@router.get(
    "/{payment_id}",
    response_model=PaymentResponse,
    summary="Get payment detail",
)
async def get_payment(
    payment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await payment_service.get_payment(db, payment_id)


# ── PUT /api/v1/payments/{id}/status ──────────────────────────────────────────

@router.put(
    "/{payment_id}/status",
    response_model=PaymentResponse,
    summary="Update payment status",
)
async def update_payment_status(
    payment_id: UUID,
    data: PaymentStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Allowed transitions: pending → paid | partial | failed | refunded.
    Stamping paid_at happens automatically on first transition to **paid**.
    """
    return await payment_service.update_payment_status(db, payment_id, data)


# ── POST /api/v1/payments/{id}/refund ─────────────────────────────────────────

@router.post(
    "/{payment_id}/refund",
    response_model=PaymentResponse,
    summary="Initiate a refund for a payment",
)
async def refund_payment(
    payment_id: UUID,
    data: RefundRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_organizer_or_admin),
):
    """
    Full refund sets status to **refunded**.
    Partial refund (amount_mad < original) sets status to **partial**.
    Only payments with status *paid* or *partial* can be refunded.
    """
    return await payment_service.initiate_refund(db, payment_id, data)
