"""
app/core/security.py
────────────────────
JWT creation / verification and bcrypt password hashing.
Tokens carry { sub: user_id, role: ..., type: access|refresh }.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db

# ── Password hashing ───────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── OAuth2 bearer scheme ───────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# ── Token constants ────────────────────────────────────────────────────────────
TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


# ─────────────────────────────── Password utils ────────────────────────────────

def hash_password(plain_password: str) -> str:
    """Return bcrypt hash of the given password."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if plain_password matches the bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ─────────────────────────────── Token creation ────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a short-lived JWT access token.
    Default expiry: ACCESS_TOKEN_EXPIRE_MINUTES (30 min).
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": TOKEN_TYPE_ACCESS})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a long-lived JWT refresh token.
    Default expiry: REFRESH_TOKEN_EXPIRE_DAYS (7 days).
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    to_encode.update({"exp": expire, "type": TOKEN_TYPE_REFRESH})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_token(token: str, expected_type: str = TOKEN_TYPE_ACCESS) -> dict:
    """
    Decode and validate a JWT token.
    Raises HTTP 401 if invalid, expired, or wrong type.
    Returns the full decoded payload dict.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")

        if user_id is None:
            raise credentials_exception
        if token_type != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Expected {expected_type} token, got {token_type}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError:
        raise credentials_exception


# ─────────────────────────────── FastAPI dependencies ─────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    FastAPI dependency — resolves the Bearer token to a User ORM object.
    Inject with: current_user = Depends(get_current_user)
    """
    # Import here to avoid circular imports
    from app.models.user import User

    payload = verify_token(token, expected_type=TOKEN_TYPE_ACCESS)
    user_id: str = payload.get("sub")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )
    return user


async def get_current_active_admin(
    current_user=Depends(get_current_user),
):
    """Require the current user to have admin role."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required",
        )
    return current_user


async def get_current_organizer_or_admin(
    current_user=Depends(get_current_user),
):
    """Require organizer or admin role."""
    if current_user.role not in ("admin", "organizer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organizer or administrator privileges required",
        )
    return current_user
