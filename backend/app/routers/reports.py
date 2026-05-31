"""
app/routers/reports.py — Data export endpoints
Supports CSV and JSON exports for leads, visitors, exhibitors, sessions, events.
"""

import csv
import io
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])

ALLOWED_TABLES = {"leads", "visitors", "exhibitors", "sessions", "events"}


@router.get("", summary="List reports")
async def list_reports():
    return [
        {"id": "leads", "label": "Données leads", "format": "csv"},
        {"id": "visitors", "label": "Données visiteurs", "format": "csv"},
        {"id": "exhibitors", "label": "Données exposants", "format": "csv"},
        {"id": "sessions", "label": "Programme sessions", "format": "csv"},
    ]


@router.get("/export", summary="Export table data as CSV or JSON")
async def export_report(
    table: str = Query("leads", description="Table name to export"),
    format: Literal["csv", "json"] = Query("csv"),
    limit: int = Query(100, ge=1, le=500),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    if table not in ALLOWED_TABLES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Table must be one of {ALLOWED_TABLES}")

    records = await tybot.list(table, {"limit": limit, "offset": 0})

    if format == "json":
        import json
        content = json.dumps(records, ensure_ascii=False, indent=2, default=str)
        return StreamingResponse(
            io.StringIO(content),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={table}_export.json"},
        )

    # CSV export — strip internal NocoDB fields
    SKIP = {"created_by", "updated_by", "nc_order"}
    output = io.StringIO()
    if records:
        fieldnames = [k for k in records[0].keys() if k not in SKIP]
        writer = csv.DictWriter(
            output, fieldnames=fieldnames, extrasaction="ignore", lineterminator="\n"
        )
        writer.writeheader()
        writer.writerows(records)

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={table}_export.csv"},
    )
