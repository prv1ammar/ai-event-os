"""app/routers/budget.py — stub"""
from fastapi import APIRouter
router = APIRouter(prefix="/api/v1/budget", tags=["Budget"])

@router.get("", summary="Budget overview")
async def budget_overview():
    return {}
