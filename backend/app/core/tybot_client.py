"""
app/core/tybot_client.py
────────────────────────
HTTP client for TybotFlow SmartApp API.
Replaces the SQLAlchemy database layer.
"""

from typing import Any
import httpx
from app.core.config import settings


def _sanitize_write_body(body: dict, keep_keys: set[str] | None = None) -> dict:
    """Strip embedded relation data before writing to SmartDB. Records read back
    from list/get endpoints embed related rows for convenience — e.g. a fresh
    event carries "venues": [], "sessions": [], "orders": [], etc. even when
    empty. Sending any of that straight back on create/update makes TybotFlow's
    write endpoint 500, since only scalar columns and plain FK ids are writable
    that way. Every dict/list value is dropped except keys named in `keep_keys`
    (used for genuine array columns, e.g. a MultiSelect like languages).
    """
    keep_keys = keep_keys or set()

    def is_relation_value(v: Any) -> bool:
        return isinstance(v, (dict, list))

    return {
        k: v for k, v in body.items()
        if k in keep_keys or not is_relation_value(v)
    }


class TybotClient:
    def __init__(self):
        self.base_url = settings.TYBOT_API_URL
        self.api_key = settings.TYBOT_API_KEY
        self._headers = {
            "Content-Type": "application/json",
            "accept": "application/json",
            "Authorization": self.api_key,
        }

    async def list_by_table(self, table_id: str, params: dict | None = None) -> dict:
        """List records via the SmartDB records endpoint. Works for any base —
        the only read pattern used across this app (see CLAUDE.md: only the
        Evenements/CRM/Organisations/Participants/Revenu/Activite/Croissance
        bases are used; the old Event Base is never queried)."""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/api/v1/smart-db/tables/{table_id}/records",
                headers=self._headers,
                params=params or {},
                timeout=15,
            )
            r.raise_for_status()
            return r.json()

    async def get_by_table(self, table_id: str, record_id: str) -> dict | None:
        """Get a single record via the SmartDB records endpoint. Works for any base."""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/api/v1/smart-db/tables/{table_id}/records/{record_id}",
                headers=self._headers,
                timeout=15,
            )
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()

    async def create(self, table_id: str, body: dict, keep_keys: set[str] | None = None) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/api/v1/smart-db/tables/{table_id}/records",
                headers=self._headers,
                json=_sanitize_write_body(body, keep_keys),
                timeout=15,
            )
            r.raise_for_status()
            return r.json()

    async def update(self, table_id: str, body: dict, keep_keys: set[str] | None = None) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.patch(
                f"{self.base_url}/api/v1/smart-db/tables/{table_id}/records",
                headers=self._headers,
                json=_sanitize_write_body(body, keep_keys),
                timeout=15,
            )
            r.raise_for_status()
            return r.json()

    async def delete(self, table_id: str, record_id: str) -> None:
        async with httpx.AsyncClient() as client:
            r = await client.request(
                "DELETE",
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
