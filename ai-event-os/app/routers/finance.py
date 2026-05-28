"""app/routers/finance.py — stub"""
from fastapi import APIRouter
router = APIRouter(prefix="/api/v1/finance", tags=["Finance"])

@router.get("", summary="Finance overview")
async def finance_overview():
    return {}
