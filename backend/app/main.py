"""
app/main.py
───────────
FastAPI application factory.
All routers are registered here under /api/v1/.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings

# ── Routers ────────────────────────────────────────────────────────────────────
from app.routers.auth import router as auth_router
from app.routers.events import router as events_router
from app.routers.exhibitors import router as exhibitors_router
from app.routers.booths import router as booths_router
from app.routers.visitors import router as visitors_router
from app.routers.tickets import router as tickets_router
from app.routers.sessions import router as sessions_router
from app.routers.leads import router as leads_router
from app.routers.meetings import router as meetings_router
from app.routers.payments import router as payments_router
from app.routers.campaigns import router as campaigns_router
from app.routers.landing_pages import router as landing_pages_router
from app.routers.analytics import router as analytics_router
from app.routers.speakers import router as speakers_router

# ── Phase 3: Visitors / QR / Badges / Scans ───────────────────────────────────
from app.routers.badges import router as badges_router
from app.routers.scans import router as scans_router
from app.websockets.scans_ws import create_scans_ws_router

# ── Phase 5: Finance — Payments / Budget / Invoices / Dashboard ───────────────
from app.routers.budget import router as budget_router
from app.routers.finance import router as finance_router
from app.routers.invoices import router as invoices_router
from app.webhooks.stripe_webhook import router as webhooks_router

# ── Phase 6: Analytics AI / Reports / Real-time Dashboard ─────────────────────
from app.routers.ai import router as ai_router
from app.routers.reports import router as reports_router
from app.websockets.dashboard_ws import create_dashboard_ws_router


# ── Lifespan (startup / shutdown hooks) ───────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before first request, cleanup on shutdown."""
    # Future: warm up Redis connection pool, verify DB, etc.
    print(f"[START]  {settings.APP_NAME} v{settings.APP_VERSION} starting up...")
    yield
    print(f"[STOP]  {settings.APP_NAME} shutting down...")


# ── Application factory ────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Enterprise Event Management Platform — "
        "AI-powered exhibitor management, visitor tracking, "
        "lead scoring & real-time analytics."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ───────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(events_router)
app.include_router(exhibitors_router)
app.include_router(booths_router)
app.include_router(visitors_router)
app.include_router(tickets_router)
app.include_router(sessions_router)
app.include_router(leads_router)
app.include_router(meetings_router)
app.include_router(payments_router)
app.include_router(campaigns_router)
app.include_router(landing_pages_router)
app.include_router(analytics_router)
app.include_router(speakers_router)

# ── Phase 3 routers ────────────────────────────────────────────────────────────
app.include_router(badges_router)
app.include_router(scans_router)
app.include_router(create_scans_ws_router())  # WS /ws/scans/live/{event_id}

# ── Phase 5 routers ────────────────────────────────────────────────────────────
app.include_router(budget_router)
app.include_router(finance_router)
app.include_router(invoices_router)
app.include_router(webhooks_router)   # /webhooks/stripe  /webhooks/cmi

# ── Phase 6 routers ────────────────────────────────────────────────────────────
app.include_router(ai_router)         # /api/v1/ai/*
app.include_router(reports_router)    # /api/v1/reports/*
app.include_router(create_dashboard_ws_router())  # WS /ws/dashboard/{event_id}


# ── Root health check ──────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "status": "healthy",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health():
    return JSONResponse(
        content={"status": "healthy", "service": "ai-event-os-api"},
    )
