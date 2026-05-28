"""app/routers/ai.py — stub"""
from fastapi import APIRouter
router = APIRouter(prefix="/api/v1/ai", tags=["AI"])

@router.get("", summary="AI overview")
async def ai_overview():
    return {"message": "AI features coming soon"}
