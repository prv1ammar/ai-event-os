"""
app/routers/auth.py
───────────────────
Authentication via TybotFlow SmartApp API.
  POST /api/v1/auth/login  → validate via TybotFlow, issue our own JWT
  GET  /api/v1/auth/me     → current user from our token
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import create_access_token, get_current_user_payload

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

_DEMO_USERS = {
    "admin@aievent.ma": {
        "password": "Admin1234!",
        "id": "demo-admin-001",
        "first_name": "Admin",
        "last_name": "AI Event",
        "role": "admin",
        "is_active": True,
    },
}


@router.post("/login", summary="Login via TybotFlow")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    tybot: TybotClient = Depends(get_tybot),
):
    # Demo bypass — works without TybotFlow credentials
    demo = _DEMO_USERS.get(form_data.username)
    if demo and form_data.password == demo["password"]:
        token_payload = {
            "sub": demo["id"],
            "email": form_data.username,
            "role": demo["role"],
            "first_name": demo["first_name"],
            "last_name": demo["last_name"],
        }
        access_token = create_access_token(data=token_payload)
        user_data = {k: v for k, v in demo.items() if k != "password"}
        user_data["email"] = form_data.username
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "userData": user_data,
            "tybot_response": {},
        }

    try:
        data = await tybot.login(form_data.username, form_data.password)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract user info from TybotFlow response
    user_data = data.get("userData") or data.get("user") or {}
    user_id = str(user_data.get("id") or user_data.get("user_id") or form_data.username)

    # Issue our own JWT so our backend can verify it
    token_payload = {
        "sub": user_id,
        "email": form_data.username,
        "role": user_data.get("role", "user"),
        "first_name": user_data.get("firstname") or user_data.get("first_name") or "",
        "last_name": user_data.get("lastname") or user_data.get("last_name") or "",
    }
    access_token = create_access_token(data=token_payload)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "userData": user_data,
        "tybot_response": data,
    }


@router.get("/me", summary="Get current authenticated user")
async def get_me(payload: dict = Depends(get_current_user_payload)):
    return payload
