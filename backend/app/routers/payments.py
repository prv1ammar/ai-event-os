"""
app/routers/payments.py — CRUD for payments via TybotFlow SmartDB
Table: payments | Base: Revenu (pmr53lu2anreo) | ID: md2c11c484ed3c5c7
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "md2c11c484ed3c5c7"

router = APIRouter(prefix="/api/v1/payments", tags=["Payments"])


@router.get("", summary="List payments")
async def list_payments(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    # payments are linked to orders, not events; event filter not supported here
    return await tybot.list_by_table(TABLE_ID, params)


@router.post("", status_code=201, summary="Create payment record")
async def create_payment(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{payment_id}", summary="Get payment by ID")
async def get_payment(
    payment_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(payment_id))
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")
    return record


@router.patch("/{payment_id}", summary="Update payment")
async def update_payment(
    payment_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = payment_id
    return await tybot.update(TABLE_ID, data)
