"""
app/routers/invoices.py — CRUD for invoices via TybotFlow SmartDB
Table: invoices | Base: Revenu (pmr53lu2anreo) | ID: m2f4426dfad73be89
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

TABLE_ID = "m2f4426dfad73be89"

router = APIRouter(prefix="/api/v1/invoices", tags=["Invoices"])


@router.get("", summary="List invoices")
async def list_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    params = {"limit": limit, "offset": (page - 1) * limit}
    return await tybot.list_by_table(TABLE_ID, params)


@router.post("", status_code=201, summary="Create invoice")
async def create_invoice(
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    return await tybot.create(TABLE_ID, data)


@router.get("/{invoice_id}", summary="Get invoice by ID")
async def get_invoice(
    invoice_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    record = await tybot.get_by_table(TABLE_ID, str(invoice_id))
    if not record:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return record


@router.patch("/{invoice_id}", summary="Update invoice")
async def update_invoice(
    invoice_id: int,
    data: dict,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    data["id"] = invoice_id
    return await tybot.update(TABLE_ID, data)


@router.delete("/{invoice_id}", summary="Delete invoice")
async def delete_invoice(
    invoice_id: int,
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    await tybot.delete(TABLE_ID, str(invoice_id))
    return {"message": "Deleted"}
