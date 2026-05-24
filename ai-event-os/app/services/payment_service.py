"""
app/services/payment_service.py
────────────────────────────────
CRUD operations for the Payment entity.
All amounts are in MAD (Moroccan Dirham).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import Payment
from app.schemas.payment import PaymentCreate, PaymentStatusUpdate, RefundRequest


# ── Internal helpers ───────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, payment_id: uuid.UUID) -> Payment:
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment {payment_id} not found",
        )
    return payment


# ── List ───────────────────────────────────────────────────────────────────────

async def list_payments(
    db: AsyncSession,
    event_id: Optional[uuid.UUID] = None,
    payment_status: Optional[str] = None,
    method: Optional[str] = None,
    payer_type: Optional[str] = None,
    source: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> list[Payment]:
    query = select(Payment)

    if event_id:
        query = query.where(Payment.event_id == event_id)
    if payment_status:
        query = query.where(Payment.status == payment_status)
    if method:
        query = query.where(Payment.method == method)
    if payer_type:
        query = query.where(Payment.payer_type == payer_type)
    if source:
        query = query.where(Payment.source == source)

    query = (
        query
        .order_by(Payment.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


# ── Create ─────────────────────────────────────────────────────────────────────

async def create_payment(db: AsyncSession, data: PaymentCreate) -> Payment:
    # Guard duplicate bank references
    if data.reference:
        dup = await db.execute(
            select(Payment).where(Payment.reference == data.reference)
        )
        if dup.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Payment with reference '{data.reference}' already exists",
            )

    payment = Payment(
        amount_mad=data.amount_mad,
        method=data.method,
        source=data.source,
        status="pending",
        reference=data.reference,
        payer_type=data.payer_type,
        payer_id=data.payer_id,
        event_id=data.event_id,
        notes=data.notes,
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)
    return payment


# ── Read ───────────────────────────────────────────────────────────────────────

async def get_payment(db: AsyncSession, payment_id: uuid.UUID) -> Payment:
    return await _get_or_404(db, payment_id)


# ── Update status ──────────────────────────────────────────────────────────────

async def update_payment_status(
    db: AsyncSession,
    payment_id: uuid.UUID,
    data: PaymentStatusUpdate,
) -> Payment:
    payment = await _get_or_404(db, payment_id)
    payment.status = data.status
    # Stamp paid_at on first transition to "paid"
    if data.status == "paid" and payment.paid_at is None:
        payment.paid_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(payment)
    return payment


# ── Refund ─────────────────────────────────────────────────────────────────────

async def initiate_refund(
    db: AsyncSession,
    payment_id: uuid.UUID,
    data: RefundRequest,
) -> Payment:
    payment = await _get_or_404(db, payment_id)

    if payment.status not in ("paid", "partial"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot refund a payment with status '{payment.status}'. "
                   "Only 'paid' or 'partial' payments can be refunded.",
        )

    # Partial refund keeps 'partial', full refund → 'refunded'
    if data.amount_mad and data.amount_mad < payment.amount_mad:
        payment.status = "partial"
    else:
        payment.status = "refunded"

    if data.reason:
        existing = payment.notes or ""
        payment.notes = f"{existing}\n[Refund] {data.reason}".strip()

    await db.flush()
    await db.refresh(payment)
    return payment


# ── Payment history ────────────────────────────────────────────────────────────

async def get_payment_history(
    db: AsyncSession,
    payer_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
) -> list[Payment]:
    """All payments belonging to a given exhibitor or visitor UUID."""
    query = (
        select(Payment)
        .where(Payment.payer_id == payer_id)
        .order_by(Payment.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())
