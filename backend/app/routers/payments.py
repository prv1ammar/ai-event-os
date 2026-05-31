"""
app/routers/payments.py — CRUD for payments via TybotFlow SmartDB
Table: payments | ID: mxs0bx0fqiyic9m
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE = "payments"
TABLE_ID = "mxs0bx0fqiyic9m"

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
    if event_id:
        params["where"] = f"(event_id,eq,{event_id})"
    return await tybot.list(TABLE, params)


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
    record = await tybot.get(TABLE, str(payment_id))
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
