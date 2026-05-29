"""
app/core/tybot_client.py
────────────────────────
HTTP client for TybotFlow SmartApp API.
Replaces the SQLAlchemy database layer.
"""

from typing import Any
import httpx
from app.core.config import settings


class TybotClient:
    def __init__(self):
        self.base_url = settings.TYBOT_API_URL
        self.api_key = settings.TYBOT_API_KEY
        self.base_id = settings.TYBOT_BASE_ID
        self._headers = {
            "Content-Type": "application/json",
            "accept": "application/json",
            "Accept-Profile": self.base_id,
            "Content-Profile": self.base_id,
            "Authorization": self.api_key,
        }

    async def list(self, table: str, params: dict | None = None) -> list[dict]:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/api/v1/data/{table}",
                headers=self._headers,
                params=params or {},
                timeout=15,
            )
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, list) else data.get("list", data.get("items", []))

    async def get(self, table: str, record_id: str) -> dict | None:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/api/v1/data/{table}/{record_id}",
                headers=self._headers,
                timeout=15,
            )
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()

    async def create(self, table_id: str, body: dict) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/api/v1/smart-db/tables/{table_id}/records",
                headers=self._headers,
                json=body,
                timeout=15,
            )
            r.raise_for_status()
            return r.json()

    async def update(self, table_id: str, body: dict) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.patch(
                f"{self.base_url}/api/v1/smart-db/tables/{table_id}/records",
                headers=self._headers,
                json=body,
                timeout=15,
            )
            r.raise_for_status()
            return r.json()

    async def delete(self, table_id: str, record_id: str) -> None:
        async with httpx.AsyncClient() as client:
            r = await client.delete(
                f"{self.base_url}/api/v1/smart-db/tables/{table_id}/records",
                headers=self._headers,
                json={"id": record_id},
                timeout=15,
            )
            r.raise_for_status()

    async def login(self, email: str, password: str) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/api/v1/auth/login",
                headers={"Content-Type": "application/json", "accept": "application/json"},
                json={"email": email, "password": password},
                timeout=15,
            )
            r.raise_for_status()
            return r.json()


_client: TybotClient | None = None


def get_tybot() -> TybotClient:
    global _client
    if _client is None:
        _client = TybotClient()
    return _client
