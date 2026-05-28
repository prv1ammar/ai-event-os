"""app/routers/reports.py — stub"""
from fastapi import APIRouter
router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])

@router.get("", summary="List reports")
async def list_reports():
    return []
