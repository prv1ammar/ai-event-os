# app/schemas/__init__.py
# Re-export common schema utilities so other modules can import from app.schemas directly.

from app.schemas.common import MessageResponse, OrmBase, PaginatedResponse, UUIDResponse  # noqa: F401
