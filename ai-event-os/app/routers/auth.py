"""
app/routers/auth.py
───────────────────
Authentication endpoints:
  POST /api/v1/auth/register  → create account, return tokens
  POST /api/v1/auth/login     → OAuth2 password grant, return tokens
  POST /api/v1/auth/refresh   → rotate access token
  GET  /api/v1/auth/me        → current user profile
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    verify_password,
    verify_token,
    TOKEN_TYPE_REFRESH,
)
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


# ── Helper ─────────────────────────────────────────────────────────────────────

def _build_token_pair(user: User) -> dict:
    payload = {"sub": str(user.id), "role": user.role}
    return {
        "access_token": create_access_token(payload),
        "refresh_token": create_refresh_token(payload),
        "token_type": "bearer",
    }


# ── POST /register ─────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    # Check duplicate email
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        is_active=True,
    )
    db.add(user)
    await db.flush()   # get the auto-generated UUID without committing yet
    await db.refresh(user)

    tokens = _build_token_pair(user)
    return AuthResponse(
        **tokens,
        user=UserResponse.model_validate(user),
    )


# ── POST /login (OAuth2 form) ─────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Login with email + password (OAuth2 form)",
)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    result = await db.execute(select(User).where(User.email == form_data.username))
    user: User | None = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled. Contact support.",
        )

    tokens = _build_token_pair(user)
    return AuthResponse(
        **tokens,
        user=UserResponse.model_validate(user),
    )


# ── POST /refresh ─────────────────────────────────────────────────────────────

@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Obtain a new access token using a refresh token",
)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    payload = verify_token(body.refresh_token, expected_type=TOKEN_TYPE_REFRESH)
    user_id: str = payload.get("sub")

    result = await db.execute(select(User).where(User.id == user_id))
    user: User | None = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    new_payload = {"sub": str(user.id), "role": user.role}
    return TokenResponse(
        access_token=create_access_token(new_payload),
        refresh_token=create_refresh_token(new_payload),
    )


# ── GET /me ────────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user profile",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return UserResponse.model_validate(current_user)
