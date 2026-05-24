"""
app/models/base.py
──────────────────
Shared declarative base and timestamp mixin used by every ORM model.
"""

import uuid

from sqlalchemy import Column, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Single metadata registry for all SQLAlchemy models."""
    pass


class TimestampMixin:
    """Adds created_at / updated_at columns to any model."""

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class UUIDMixin:
    """Primary key as PostgreSQL UUID (auto-generated)."""

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
