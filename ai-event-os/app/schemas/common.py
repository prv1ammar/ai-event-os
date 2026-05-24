"""
app/schemas/common.py
─────────────────────
Reusable Pydantic v2 base schemas and paginated response wrapper.
"""

from typing import Generic, List, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class OrmBase(BaseModel):
    """Base schema with ORM mode enabled (Pydantic v2 style)."""
    model_config = ConfigDict(from_attributes=True)


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated list response."""
    items: List[T]
    total: int
    page: int
    limit: int
    pages: int

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    """Simple message response."""
    message: str


class UUIDResponse(BaseModel):
    """Response that returns a single UUID."""
    id: UUID
