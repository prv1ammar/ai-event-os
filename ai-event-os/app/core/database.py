"""
app/core/database.py
────────────────────
Async SQLAlchemy engine, session factory, and FastAPI dependency.
All database access must use `async with` or `Depends(get_db)`.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import settings

# ── Engine ─────────────────────────────────────────────────────────────────────
# NullPool is recommended for async engines to avoid connection leaks in tests
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,           # logs SQL queries in development
    future=True,
    pool_pre_ping=True,            # recycle stale connections
    poolclass=NullPool,            # use NullPool for async
)

# ── Session factory ────────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,        # prevent lazy-load errors after commit
    autoflush=False,
    autocommit=False,
)


# ── FastAPI dependency ─────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an async DB session for the duration of one request.
    Automatically rolls back on exception and closes when done.

    Usage:
        @router.get("/items")
        async def list_items(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
