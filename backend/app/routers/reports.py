"""
app/routers/reports.py — Data export endpoints
Supports CSV and JSON exports for the new multi-base tables.
"""

import csv
import io
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core.tybot_client import TybotClient, get_tybot
from app.core.security import get_current_user

router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])

# Logical export name → SmartDB table id (new bases)
TABLE_IDS = {
    "leads": "m78f17b1f5fcb640d",       # contacts (CRM)
    "visitors": "m3b5a520cdf13cc6e",    # visiteurs (Participants)
    "exhibitors": "m0b2dd0eb02083bf3",  # exposants (Participants)
    "sessions": "mabd59f3b36f4df83",    # sessions (Evenements)
    "events": "m3ae0796104dae2e3",      # events (Evenements)
    "orders": "m0067719083ff9860",      # orders (Revenu)
}


@router.get("", summary="List reports")
async def list_reports():
    return [
        {"id": "leads", "label": "Données leads", "format": "csv"},
        {"id": "visitors", "label": "Données visiteurs", "format": "csv"},
        {"id": "exhibitors", "label": "Données exposants", "format": "csv"},
        {"id": "sessions", "label": "Programme sessions", "format": "csv"},
        {"id": "orders", "label": "Commandes", "format": "csv"},
    ]


@router.get("/export", summary="Export table data as CSV or JSON")
async def export_report(
    table: str = Query("leads", description="Table name to export"),
    format: Literal["csv", "json"] = Query("csv"),
    limit: int = Query(100, ge=1, le=500),
    tybot: TybotClient = Depends(get_tybot),
    current_user=Depends(get_current_user),
):
    if table not in TABLE_IDS:
        raise HTTPException(status_code=400, detail=f"Table must be one of {set(TABLE_IDS)}")

    data = await tybot.list_by_table(TABLE_IDS[table], {"limit": limit})
    records = data.get("list", [])

    if format == "json":
        import json
        content = json.dumps(records, ensure_ascii=False, indent=2, default=str)
        return StreamingResponse(
            io.StringIO(content),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={table}_export.json"},
        )

    # CSV export — keep scalar columns only (relations come back as dicts/lists)
    output = io.StringIO()
    if records:
        fieldnames = [
            k for k, v in records[0].items()
            if not isinstance(v, (dict, list)) and k not in {"Created At", "Updated At"}
        ]
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
