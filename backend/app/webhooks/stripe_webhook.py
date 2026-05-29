"""app/webhooks/stripe_webhook.py — stub"""
from fastapi import APIRouter
router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

@router.post("/stripe")
async def stripe_webhook():
    return {"received": True}
