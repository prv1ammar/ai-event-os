"""app/routers/landing_pages.py — stub"""
from fastapi import APIRouter
router = APIRouter(prefix="/api/v1/landing-pages", tags=["Landing Pages"])

@router.get("", summary="List landing pages")
async def list_landing_pages():
    return []
