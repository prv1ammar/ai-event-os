"""app/routers/invoices.py — stub"""
from fastapi import APIRouter
router = APIRouter(prefix="/api/v1/invoices", tags=["Invoices"])

@router.get("", summary="List invoices")
async def list_invoices():
    return []
