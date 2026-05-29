"""
app/core/config.py
──────────────────
Centralised configuration loaded from environment variables / .env file.
Uses Pydantic v2 BaseSettings — never hardcode secrets.
"""

from functools import lru_cache
from typing import List

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── App ────────────────────────────────────────────────────────────────────
    APP_ENV: str = "development"
    APP_NAME: str = "AI EVENT OS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # ── TybotFlow SmartApp ─────────────────────────────────────────────────────
    TYBOT_API_URL: str = "https://api.tybotflow.com"
    TYBOT_API_KEY: str = ""
    TYBOT_BASE_ID: str = ""

    # ── Database (optional fallback) ───────────────────────────────────────────
    DATABASE_URL: str = ""

    # ── Redis / Celery ─────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    # ── Auth ───────────────────────────────────────────────────────────────────
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── CORS ───────────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v: str) -> str:
        return v

    def get_cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    # ── External APIs ──────────────────────────────────────────────────────────
    SENDGRID_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    # ── Stripe ─────────────────────────────────────────────────────────────────
    STRIPE_API_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = "whsec_test_placeholder"

    # ── CMI (Centre Monétique Interbancaire — Moroccan gateway) ────────────────
    CMI_MERCHANT_ID: str = ""
    CMI_STORE_KEY: str = ""

    # ── pgAdmin ────────────────────────────────────────────────────────────────
    PGADMIN_EMAIL: str = "admin@aievents.ma"
    PGADMIN_PASSWORD: str = "pgadmin_secret"


@lru_cache()
def get_settings() -> Settings:
    """Return cached settings singleton — safe to call multiple times."""
    return Settings()


settings = get_settings()
