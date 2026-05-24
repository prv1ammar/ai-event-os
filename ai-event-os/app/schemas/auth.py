"""
app/schemas/auth.py
───────────────────
Pydantic v2 schemas for authentication endpoints.
"""

from typing import Optional
from uuid import UUID

from pydantic import EmailStr, Field, field_validator

from app.schemas.common import OrmBase


# ── Request schemas ────────────────────────────────────────────────────────────

class RegisterRequest(OrmBase):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    role: str = Field(default="visitor", pattern="^(admin|organizer|exhibitor|visitor)$")

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginRequest(OrmBase):
    """Used by the custom JSON login endpoint (not OAuth2 form)."""
    email: EmailStr
    password: str


class RefreshRequest(OrmBase):
    refresh_token: str


# ── Response schemas ───────────────────────────────────────────────────────────

class TokenResponse(OrmBase):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(OrmBase):
    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    event_id: Optional[UUID] = None


class AuthResponse(OrmBase):
    """Combined token + user info returned after login / register."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
