"""
app/services/visitor_service.py
────────────────────────────────
Business logic for visitor registration, CRUD, CSV bulk import,
Excel export, and journey tracking.

All functions are async and receive an AsyncSession injected by FastAPI's
Depends(get_db).  They return ORM objects (serialised by the router's
response_model) or plain dicts/bytes for file responses.
"""

from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import pandas as pd
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.event import Event
from app.models.visitor import Visitor
from app.schemas.visitor import (
    VALID_VISITOR_TYPES,
    VisitorCreate,
    VisitorUpdate,
)

# ── CSV import constants ───────────────────────────────────────────────────────

REQUIRED_COLUMNS = ["first_name", "last_name", "email", "company", "type"]


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, visitor_id: uuid.UUID) -> Visitor:
    result = await db.execute(select(Visitor).where(Visitor.id == visitor_id))
    visitor = result.scalar_one_or_none()
    if visitor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visitor {visitor_id} not found",
        )
    return visitor


async def _event_exists(db: AsyncSession, event_id: uuid.UUID) -> None:
    result = await db.execute(select(Event).where(Event.id == event_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found",
        )


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def get_all(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    visitor_type: Optional[str],
    country: Optional[str],
    page: int,
    limit: int,
) -> tuple[List[Visitor], int]:
    """Return (items, total) for the given filters and page."""
    query = select(Visitor)

    if event_id:
        query = query.where(Visitor.event_id == event_id)
    if visitor_type:
        query = query.where(Visitor.type == visitor_type)
    if country:
        query = query.where(Visitor.country == country)

    # Total count (before pagination)
    count_q = select(func.count()).select_from(query.subquery())
    total: int = (await db.execute(count_q)).scalar() or 0

    query = (
        query
        .order_by(Visitor.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = await db.execute(query)
    return list(rows.scalars().all()), total


async def get_by_id(db: AsyncSession, visitor_id: uuid.UUID) -> Visitor:
    """Return visitor with eagerly-loaded tickets and scan history."""
    result = await db.execute(
        select(Visitor)
        .options(
            selectinload(Visitor.tickets),
            selectinload(Visitor.qr_scans),
        )
        .where(Visitor.id == visitor_id)
    )
    visitor = result.scalar_one_or_none()
    if visitor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visitor {visitor_id} not found",
        )
    return visitor


async def create(db: AsyncSession, data: VisitorCreate) -> Visitor:
    """Register a single visitor after validating the event exists."""
    await _event_exists(db, data.event_id)

    visitor = Visitor(
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email.lower().strip(),
        phone=data.phone,
        company=data.company,
        role=data.role,
        type=data.type,
        country=data.country,
        event_id=data.event_id,
    )
    db.add(visitor)
    await db.flush()
    await db.refresh(visitor)
    return visitor


async def update(
    db: AsyncSession, visitor_id: uuid.UUID, data: VisitorUpdate
) -> Visitor:
    """Partial update — only provided fields are changed."""
    visitor = await _get_or_404(db, visitor_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(visitor, field, value)
    await db.flush()
    await db.refresh(visitor)
    return visitor


async def delete(db: AsyncSession, visitor_id: uuid.UUID) -> dict:
    """
    Hard delete a visitor (cascades to tickets and scans via FK).
    Documented as "soft delete" at the API level — the resource
    simply disappears; it cannot be restored.
    """
    visitor = await _get_or_404(db, visitor_id)
    name = f"{visitor.first_name} {visitor.last_name}"
    await db.delete(visitor)
    await db.flush()
    return {"message": f"Visitor '{name}' has been removed"}


# ── CSV bulk import ────────────────────────────────────────────────────────────

async def import_from_csv(
    db: AsyncSession,
    file: UploadFile,
    event_id: uuid.UUID,
) -> dict:
    """
    Import visitors from a CSV file.

    Flow:
      1. Read CSV with pandas
      2. Validate required columns
      3. Validate 'type' column values
      4. Skip rows with duplicate emails (already in DB for this event)
      5. Bulk-insert valid rows
      6. Return {imported, skipped, errors, total_rows}
    """
    await _event_exists(db, event_id)

    # ── Read CSV ──────────────────────────────────────────────────────────────
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot parse CSV: {exc}",
        )

    # ── Validate columns ──────────────────────────────────────────────────────
    df.columns = [c.strip().lower() for c in df.columns]
    missing_cols = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing_cols:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing required columns: {sorted(missing_cols)}",
        )

    total_rows = len(df)
    errors: List[str] = []
    imported = 0
    skipped  = 0

    # ── Preload existing emails for this event (avoid N+1 queries) ────────────
    existing_result = await db.execute(
        select(Visitor.email).where(Visitor.event_id == event_id)
    )
    existing_emails: set[str] = {
        row[0].lower() for row in existing_result.fetchall()
    }

    # ── Process each row ──────────────────────────────────────────────────────
    for idx, row in df.iterrows():
        row_num = int(idx) + 2  # 1-based with header

        # Required fields — check for nulls
        missing_vals = [
            col for col in REQUIRED_COLUMNS
            if pd.isna(row.get(col, None)) or str(row.get(col, "")).strip() == ""
        ]
        if missing_vals:
            errors.append(f"Row {row_num}: missing values for {missing_vals}")
            skipped += 1
            continue

        # Validate type
        v_type = str(row["type"]).strip().lower()
        if v_type not in VALID_VISITOR_TYPES:
            errors.append(
                f"Row {row_num}: invalid type '{row['type']}' — "
                f"must be one of {sorted(VALID_VISITOR_TYPES)}"
            )
            skipped += 1
            continue

        # Duplicate email check
        email = str(row["email"]).strip().lower()
        if email in existing_emails:
            errors.append(f"Row {row_num}: email '{email}' already registered for this event")
            skipped += 1
            continue

        # Build and stage visitor
        visitor = Visitor(
            first_name=str(row["first_name"]).strip(),
            last_name=str(row["last_name"]).strip(),
            email=email,
            phone=str(row["phone"]).strip() if "phone" in df.columns and not pd.isna(row.get("phone")) else None,
            company=str(row["company"]).strip() if not pd.isna(row.get("company")) else None,
            role=str(row["role"]).strip() if "role" in df.columns and not pd.isna(row.get("role")) else None,
            type=v_type,
            country=str(row["country"]).strip() if "country" in df.columns and not pd.isna(row.get("country")) else "Morocco",
            event_id=event_id,
        )
        db.add(visitor)
        existing_emails.add(email)   # prevent intra-batch duplicates
        imported += 1

    # ── Flush all staged visitors in one round-trip ───────────────────────────
    if imported > 0:
        await db.flush()

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "total_rows": total_rows,
    }


# ── Excel export ───────────────────────────────────────────────────────────────

async def export_to_xlsx(
    db: AsyncSession,
    event_id: Optional[uuid.UUID],
    visitor_type: Optional[str],
    country: Optional[str],
) -> bytes:
    """
    Export filtered visitors to an Excel workbook.

    Returns raw .xlsx bytes suitable for a StreamingResponse.
    Uses openpyxl via pandas for maximum compatibility.
    """
    # Fetch all matching visitors (no pagination for full export)
    query = select(Visitor)
    if event_id:
        query = query.where(Visitor.event_id == event_id)
    if visitor_type:
        query = query.where(Visitor.type == visitor_type)
    if country:
        query = query.where(Visitor.country == country)

    query = query.order_by(Visitor.created_at.desc())
    result = await db.execute(query)
    visitors = list(result.scalars().all())

    if not visitors:
        # Return an empty workbook with headers
        records = []
    else:
        records = [
            {
                "id":         str(v.id),
                "first_name": v.first_name,
                "last_name":  v.last_name,
                "email":      v.email,
                "phone":      v.phone or "",
                "company":    v.company or "",
                "role":       v.role or "",
                "type":       v.type,
                "country":    v.country or "",
                "event_id":   str(v.event_id),
                "created_at": v.created_at.isoformat() if v.created_at else "",
            }
            for v in visitors
        ]

    df = pd.DataFrame(records)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Visitors")
    return buffer.getvalue()


# ── Journey ────────────────────────────────────────────────────────────────────

async def get_journey(db: AsyncSession, visitor_id: uuid.UUID) -> dict:
    """
    Return the visitor's full scan journey sorted chronologically.
    """
    from app.models.ticket import QRScan

    visitor = await _get_or_404(db, visitor_id)

    result = await db.execute(
        select(QRScan)
        .where(QRScan.visitor_id == visitor_id)
        .order_by(QRScan.scanned_at.asc())
    )
    scans = list(result.scalars().all())

    return {
        "visitor_id":   visitor.id,
        "visitor_name": f"{visitor.first_name} {visitor.last_name}",
        "visitor_type": visitor.type,
        "total_scans":  len(scans),
        "scans":        scans,
    }
