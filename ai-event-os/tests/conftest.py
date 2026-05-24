"""
tests/conftest.py
─────────────────
Shared pytest fixtures: async test client, isolated test DB session,
and auth helper fixtures for organizer / admin tokens.

Test DB: SQLite in-memory via aiosqlite (no PostgreSQL needed in CI).

Fix notes
─────────
1. The SQLite JSONB patch MUST be applied before any SQLAlchemy model is
   imported so that Base.metadata.create_all() can run without crashing.
2. `import app.models.*` would shadow the `app` name (FastAPI instance)
   with the `app` package.  We avoid this by using explicit `from` imports
   with underscored aliases.
"""

import asyncio
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# ── 1a. SQLite JSONB patch (must be first — before any model import) ──────────
# JSONB is a PostgreSQL-only type.  Teach the SQLite compiler to treat it as
# plain TEXT so that Base.metadata.create_all() works in the test DB.
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler

if not hasattr(SQLiteTypeCompiler, "visit_JSONB"):
    def _sqlite_visit_jsonb(self, type_, **kw):          # type: ignore[override]
        return "TEXT"
    SQLiteTypeCompiler.visit_JSONB = _sqlite_visit_jsonb  # type: ignore[attr-defined]

# ── 1b. UUID string→object coercion for SQLite tests ──────────────────────────
# The generic Uuid.bind_processor calls `value.hex` which works for uuid.UUID
# objects but raises AttributeError on plain strings (e.g. JWT "sub" field).
# We patch the processor so strings are converted to uuid.UUID first.
import uuid as _uuid_module
from sqlalchemy.types import Uuid as _SaUuid

_orig_uuid_bp = _SaUuid.bind_processor


def _patched_uuid_bind_processor(self, dialect):          # type: ignore[override]
    proc = _orig_uuid_bp(self, dialect)
    if proc is None:
        return None

    def _safe(value):
        if isinstance(value, str):
            try:
                value = _uuid_module.UUID(value)
            except (ValueError, AttributeError):
                pass
        return proc(value)

    return _safe


_SaUuid.bind_processor = _patched_uuid_bind_processor    # type: ignore[method-assign]

# ── 2. App + DB imports (models are loaded transitively via main.py) ───────────
from app.core.database import get_db
from app.main import app as _fastapi_app      # alias → never shadows 'app' package
from app.models.base import Base

# Ensure SessionAttendance is registered with Base.metadata.
# We use a 'from' import with underscore alias to avoid package-name shadowing.
from app.models.session_attendance import SessionAttendance as _SessionAttendance  # noqa: F401
from app.models.landing_page import LandingPage as _LandingPage, LandingPageVisit as _LandingPageVisit  # noqa: F401

# ── Phase 5: Finance models ────────────────────────────────────────────────────
from app.models.budget import BudgetCategory as _BudgetCategory, Expense as _Expense  # noqa: F401
from app.models.invoice import Invoice as _Invoice  # noqa: F401

# Expose the FastAPI instance under the name expected by the fixture bodies.
app = _fastapi_app

# ── Test database URL ──────────────────────────────────────────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"


# ── Event loop (session-scoped) ────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    """Single event loop shared for the whole test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ── Engine (session-scoped) ────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        # Drop-then-create ensures no stale schema from previous crashed runs
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ── DB session (function-scoped — rolls back after each test) ──────────────────

@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    TestSession = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with TestSession() as session:
        yield session
        await session.rollback()


# ── HTTP test client ───────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client with the real DB replaced by the test session."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Auth helpers ───────────────────────────────────────────────────────────────

async def _register_and_login(
    client: AsyncClient,
    email: str,
    role: str,
    password: str = "TestPass123",
) -> str:
    """Register (or re-use) a user and return a valid Bearer access token."""
    payload = {
        "email": email,
        "password": password,
        "full_name": f"Test {role.capitalize()}",
        "role": role,
    }
    reg = await client.post("/api/v1/auth/register", json=payload)
    if reg.status_code == 201:
        return reg.json()["access_token"]
    # Already registered — login instead
    login_resp = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return login_resp.json()["access_token"]


@pytest_asyncio.fixture
async def organizer_token(client: AsyncClient) -> str:
    return await _register_and_login(
        client, "organizer@aievents.ma", "organizer"
    )


@pytest_asyncio.fixture
async def organizer_headers(organizer_token: str) -> dict:
    return {"Authorization": f"Bearer {organizer_token}"}


@pytest_asyncio.fixture
async def visitor_token(client: AsyncClient) -> str:
    return await _register_and_login(
        client, "visitor@aievents.ma", "visitor"
    )


@pytest_asyncio.fixture
async def visitor_headers(visitor_token: str) -> dict:
    return {"Authorization": f"Bearer {visitor_token}"}
