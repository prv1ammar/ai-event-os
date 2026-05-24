"""
app/webhooks/stripe_webhook.py
────────────────────────────────
Stripe and CMI (Centre Monétique Interbancaire) webhook handlers.

These endpoints are intentionally unauthenticated (no Bearer token) —
they are secured by payload signature verification instead.

POST /webhooks/stripe   — Stripe signature: stripe-signature header (HMAC-SHA256)
POST /webhooks/cmi      — CMI signature: HASH field in form body (SHA-512)

Stripe events handled
─────────────────────
payment_intent.succeeded    → status=paid, stamp paid_at, generate+email invoice
payment_intent.payment_failed → status=failed, send failure notification
charge.refunded             → status=refunded

CMI events handled
──────────────────
Approved  → status=paid
Declined  → status=failed
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.payment import Payment
from app.schemas.invoice import InvoiceGenerateRequest
from app.services import invoice_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


# ── Stripe webhook ─────────────────────────────────────────────────────────────

@router.post(
    "/stripe",
    summary="Stripe payment webhook (no auth — signature verified)",
    status_code=200,
)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receives Stripe webhook events and updates payment records accordingly.

    Security: validates the `stripe-signature` HMAC header against
    STRIPE_WEBHOOK_SECRET from settings before processing any event.
    """
    payload: bytes = await request.body()
    sig_header: str = request.headers.get("stripe-signature", "")

    # ── Signature verification ─────────────────────────────────────────────
    try:
        import stripe  # type: ignore
        stripe.api_key = settings.STRIPE_API_KEY
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except Exception as exc:
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Stripe webhook signature",
        )

    event_type: str = event.get("type", "")
    event_data: dict = event.get("data", {}).get("object", {})

    logger.info("Stripe event received: %s", event_type)

    # ── Event routing ──────────────────────────────────────────────────────

    if event_type == "payment_intent.succeeded":
        await _handle_payment_succeeded(db, event_data)

    elif event_type == "payment_intent.payment_failed":
        await _handle_payment_failed(db, event_data)

    elif event_type == "charge.refunded":
        await _handle_charge_refunded(db, event_data)

    else:
        logger.debug("Stripe event type '%s' not handled — ignoring.", event_type)

    return {"status": "ok", "event": event_type}


async def _handle_payment_succeeded(db: AsyncSession, pi: dict) -> None:
    """Mark payment as paid and auto-generate an invoice."""
    reference: str = pi.get("id", "")           # payment_intent id
    amount_received: int = pi.get("amount_received", 0) // 100  # Stripe uses cents

    payment = await _find_payment_by_reference(db, reference)
    if payment is None:
        logger.warning("payment_intent.succeeded: no payment with ref=%s", reference)
        return

    payment.status = "paid"
    payment.paid_at = datetime.now(timezone.utc)
    await db.flush()

    # Auto-generate invoice if not already present
    try:
        await invoice_service.generate_invoice(
            db,
            payment.id,
            InvoiceGenerateRequest(
                payer_name="Client Stripe",
                payer_email=pi.get("receipt_email") or "",
                description=f"Paiement Stripe — PI {reference}",
                due_days=0,
            ),
        )
        logger.info("Invoice auto-generated for payment %s", payment.id)
    except HTTPException as exc:
        if exc.status_code == 409:
            pass  # invoice already exists — fine
        else:
            logger.error("Invoice generation failed: %s", exc.detail)


async def _handle_payment_failed(db: AsyncSession, pi: dict) -> None:
    """Mark payment as failed."""
    reference: str = pi.get("id", "")
    payment = await _find_payment_by_reference(db, reference)
    if payment is None:
        logger.warning("payment_intent.payment_failed: no payment with ref=%s", reference)
        return
    payment.status = "failed"
    payment.notes = (payment.notes or "") + f"\n[Stripe] Payment failed: {pi.get('last_payment_error', {}).get('message', '')}".rstrip()
    await db.flush()
    logger.info("Payment %s marked as failed", payment.id)


async def _handle_charge_refunded(db: AsyncSession, charge: dict) -> None:
    """Mark payment as refunded."""
    pi_id: str = charge.get("payment_intent", "")
    payment = await _find_payment_by_reference(db, pi_id)
    if payment is None:
        logger.warning("charge.refunded: no payment with ref=%s", pi_id)
        return
    payment.status = "refunded"
    await db.flush()
    logger.info("Payment %s marked as refunded via Stripe", payment.id)


async def _find_payment_by_reference(
    db: AsyncSession, reference: str
) -> Payment | None:
    """Look up a payment by its bank/gateway reference string."""
    if not reference:
        return None
    result = await db.execute(
        select(Payment).where(Payment.reference == reference)
    )
    return result.scalar_one_or_none()


# ── CMI webhook ────────────────────────────────────────────────────────────────

@router.post(
    "/cmi",
    summary="CMI (Centre Monétique Interbancaire) payment webhook",
    status_code=200,
)
async def cmi_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Handles notifications from the Moroccan CMI payment gateway.

    CMI sends application/x-www-form-urlencoded POST with fields including:
    - clientid      : merchant ID
    - oid           : order ID (mapped to payment reference)
    - Response      : Approved | Declined | Error
    - amount        : transaction amount
    - HASH          : SHA-512 HMAC signature for verification
    - HashAlgorithm : HMAC_SHA512
    """
    form = await request.form()
    data = dict(form)

    # ── Signature verification (CMI HMAC-SHA512) ───────────────────────────
    received_hash: str = data.pop("HASH", "")
    if settings.CMI_STORE_KEY:
        computed = _compute_cmi_hash(data, settings.CMI_STORE_KEY)
        if not hmac.compare_digest(computed.upper(), received_hash.upper()):
            logger.warning("CMI webhook: invalid HASH signature")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid CMI webhook signature",
            )

    response_code: str = data.get("Response", "")
    order_id: str = data.get("oid", "")

    logger.info("CMI event received: Response=%s oid=%s", response_code, order_id)

    payment = await _find_payment_by_reference(db, order_id)
    if payment is None:
        logger.warning("CMI webhook: no payment with oid=%s", order_id)
        return {"status": "ok", "message": "payment not found"}

    if response_code == "Approved":
        payment.status = "paid"
        payment.paid_at = datetime.now(timezone.utc)
        await db.flush()
        logger.info("CMI payment %s approved", order_id)

    elif response_code in ("Declined", "Error"):
        payment.status = "failed"
        reason = data.get("ErrMsg", response_code)
        payment.notes = (payment.notes or "") + f"\n[CMI] {reason}".rstrip()
        await db.flush()
        logger.info("CMI payment %s declined/error: %s", order_id, reason)

    # CMI expects the literal string "ACTION=POSTAUTH" for approved transactions
    if response_code == "Approved":
        return "ACTION=POSTAUTH"

    return {"status": "ok", "response": response_code}


def _compute_cmi_hash(data: dict, store_key: str) -> str:
    """
    CMI HMAC-SHA512 computation.
    Concatenate all field values (sorted by key, excluding HASH) with '|' separator,
    then compute HMAC-SHA512 with the store key.
    """
    sorted_values = "|".join(str(data[k]) for k in sorted(data.keys()))
    return hmac.new(
        store_key.encode("utf-8"),
        sorted_values.encode("utf-8"),
        hashlib.sha512,
    ).hexdigest()
