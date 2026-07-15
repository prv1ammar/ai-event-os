"""
app/routers/orders.py — CRUD for orders via TybotFlow SmartDB
Table: orders | Base: Revenu (pmr53lu2anreo) | ID: m0067719083ff9860

Orders cover billets, stands, sponsoring et packages
(order_type: billet | stand | sponsoring | package).
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "m0067719083ff9860"

router = APIRouter(prefix="/api/v1/orders", tags=["Orders"])


@router.get("", summary="List orders")
async def list_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    event_id: int = Query(None),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    if event_id:
        params["where"] = f"(events_id,eq,{event_id})"
    return await tybot.list_by_table(TABLE_ID, params)


@router.post("", status_code=201, summary="Create order")
async def create_order(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{order_id}", summary="Get order by ID")
async def get_order(
    order_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(order_id))
    if not record:
        raise HTTPException(status_code=404, detail="Order not found")
    return record


@router.patch("/{order_id}", summary="Update order")
async def update_order(
    order_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = order_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{order_id}", summary="Delete order")
async def delete_order(
    order_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(order_id))
    return {"message": "Deleted"}
