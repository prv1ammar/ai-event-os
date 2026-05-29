"""app/routers/analytics.py — stub"""
from fastapi import APIRouter
router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])

@router.get("", summary="Analytics overview")
async def analytics_overview():
    return {"message": "Analytics coming soon"}
