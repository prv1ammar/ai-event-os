"""
tests/test_finance.py
──────────────────────
Comprehensive tests for the finance module:

  Budget   — /api/v1/budget
  Finance  — /api/v1/finance
  Invoices — /api/v1/invoices

Covers:
  - Budget category creation and overview
  - Expense CRUD + soft-delete
  - Variance and forecast reports
  - Financial dashboard KPIs (revenue, ROI, occupancy)
  - Revenue-by-source breakdown
  - Invoice generation (INV-YYYY-MM-seq format)
  - Invoice PDF download (checks content-type + non-empty)
  - Invoice send-email + status update
  - Excel + PDF export endpoints (checks content-type)
  - Authorization: organizer/admin required for write ops
  - 404 handling throughout
"""

import uuid

import pytest
from httpx import AsyncClient

# ── Constants ──────────────────────────────────────────────────────────────────

NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000"

EVENT_BASE = {
    "name": "Finance Integration Event",
    "start_date": "2026-10-01",
    "end_date": "2026-10-04",
    "venue": "Palais des Congrès",
    "city": "Marrakech",
    "country": "Morocco",
    "capacity": 5000,
    "category": "conference",
    "budget_mad": 2_000_000,
}

PAYER_ID = str(uuid.uuid4())


# ── Shared helper functions ────────────────────────────────────────────────────

async def _create_event(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/events", json=EVENT_BASE, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_payment(
    client: AsyncClient,
    headers: dict,
    event_id: str,
    amount: int = 100_000,
    source: str = "stands",
    status: str = "paid",
) -> dict:
    payload = {
        "amount_mad": amount,
        "method": "transfer",
        "source": source,
        "payer_type": "exhibitor",
        "payer_id": PAYER_ID,
        "event_id": event_id,
    }
    r = await client.post("/api/v1/payments", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    payment = r.json()

    if status != "pending":
        r2 = await client.put(
            f"/api/v1/payments/{payment['id']}/status",
            json={"status": status},
            headers=headers,
        )
        assert r2.status_code == 200
        payment = r2.json()

    return payment


async def _create_budget_category(
    client: AsyncClient,
    headers: dict,
    event_id: str,
    name: str = "Logistique",
    budget: int = 500_000,
) -> dict:
    payload = {"event_id": event_id, "name": name, "budget_mad": budget}
    r = await client.post("/api/v1/budget/category", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def _create_expense(
    client: AsyncClient,
    headers: dict,
    event_id: str,
    category_id: str,
    amount: int = 50_000,
    description: str = "Dépense test",
) -> dict:
    payload = {
        "event_id": event_id,
        "category_id": category_id,
        "description": description,
        "amount_mad": amount,
        "vendor": "Fournisseur SARL",
    }
    r = await client.post("/api/v1/budget/expense", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ═══════════════════════════════════════════════════════════════════════════════
# BUDGET ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ── POST /api/v1/budget/category ──────────────────────────────────────────────

async def test_create_budget_category(client: AsyncClient, organizer_headers: dict):
    """Organizer can create a budget category."""
    event_id = await _create_event(client, organizer_headers)
    cat = await _create_budget_category(client, organizer_headers, event_id)

    assert cat["name"] == "Logistique"
    assert cat["budget_mad"] == 500_000
    assert cat["event_id"] == event_id
    assert "id" in cat


async def test_create_budget_category_invalid_name(client: AsyncClient, organizer_headers: dict):
    """Unknown category name returns 422."""
    event_id = await _create_event(client, organizer_headers)
    payload = {"event_id": event_id, "name": "Cuisine", "budget_mad": 100_000}
    r = await client.post("/api/v1/budget/category", json=payload, headers=organizer_headers)
    assert r.status_code == 422


async def test_create_budget_category_all_valid_names(client: AsyncClient, organizer_headers: dict):
    """All 6 standard category names are accepted."""
    event_id = await _create_event(client, organizer_headers)
    for name in ("Logistique", "Communication", "Technique", "Marketing", "Restauration", "Divers"):
        payload = {"event_id": event_id, "name": name, "budget_mad": 100_000}
        r = await client.post("/api/v1/budget/category", json=payload, headers=organizer_headers)
        assert r.status_code == 201, f"{name}: {r.text}"


async def test_create_budget_category_duplicate(client: AsyncClient, organizer_headers: dict):
    """Duplicate category name for same event returns 409."""
    event_id = await _create_event(client, organizer_headers)
    await _create_budget_category(client, organizer_headers, event_id, name="Technique")

    payload = {"event_id": event_id, "name": "Technique", "budget_mad": 200_000}
    r = await client.post("/api/v1/budget/category", json=payload, headers=organizer_headers)
    assert r.status_code == 409


async def test_create_budget_category_visitor_forbidden(
    client: AsyncClient, organizer_headers: dict, visitor_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    payload = {"event_id": event_id, "name": "Marketing", "budget_mad": 50_000}
    r = await client.post("/api/v1/budget/category", json=payload, headers=visitor_headers)
    assert r.status_code == 403


# ── GET /api/v1/budget/{event_id} ─────────────────────────────────────────────

async def test_get_budget_overview_empty(client: AsyncClient, organizer_headers: dict):
    """New event has zero budget and empty expense list."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(f"/api/v1/budget/{event_id}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["event_id"] == event_id
    assert data["total_budget_mad"] == 0
    assert data["total_spent_mad"] == 0
    assert data["categories"] == []
    assert data["expenses"] == []


async def test_get_budget_overview_with_data(client: AsyncClient, organizer_headers: dict):
    """Overview shows categories and expenses correctly."""
    event_id = await _create_event(client, organizer_headers)
    cat = await _create_budget_category(client, organizer_headers, event_id, budget=300_000)
    await _create_expense(client, organizer_headers, event_id, cat["id"], amount=100_000)

    r = await client.get(f"/api/v1/budget/{event_id}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()

    assert data["total_budget_mad"] == 300_000
    assert data["total_spent_mad"] == 100_000
    assert data["total_variance_mad"] == 200_000
    assert len(data["categories"]) == 1
    assert len(data["expenses"]) == 1
    assert data["categories"][0]["budget_mad"] == 300_000
    assert data["categories"][0]["spent_mad"] == 100_000
    assert data["categories"][0]["variance_mad"] == 200_000


# ── POST /api/v1/budget/expense ───────────────────────────────────────────────

async def test_create_expense(client: AsyncClient, organizer_headers: dict):
    """Can add an expense with valid data."""
    event_id = await _create_event(client, organizer_headers)
    cat = await _create_budget_category(client, organizer_headers, event_id)
    expense = await _create_expense(client, organizer_headers, event_id, cat["id"])

    assert expense["amount_mad"] == 50_000
    assert expense["status"] == "pending"
    assert expense["vendor"] == "Fournisseur SARL"
    assert expense["category_id"] == cat["id"]
    assert expense["event_id"] == event_id


async def test_create_expense_zero_amount(client: AsyncClient, organizer_headers: dict):
    """Zero amount returns 422."""
    event_id = await _create_event(client, organizer_headers)
    cat = await _create_budget_category(client, organizer_headers, event_id)
    payload = {
        "event_id": event_id,
        "category_id": cat["id"],
        "description": "Test",
        "amount_mad": 0,
    }
    r = await client.post("/api/v1/budget/expense", json=payload, headers=organizer_headers)
    assert r.status_code == 422


async def test_create_expense_unknown_category(client: AsyncClient, organizer_headers: dict):
    """Unknown category_id returns 404."""
    event_id = await _create_event(client, organizer_headers)
    payload = {
        "event_id": event_id,
        "category_id": NONEXISTENT_ID,
        "description": "Test",
        "amount_mad": 10_000,
    }
    r = await client.post("/api/v1/budget/expense", json=payload, headers=organizer_headers)
    assert r.status_code == 404


# ── PUT /api/v1/budget/expense/{id} ───────────────────────────────────────────

async def test_update_expense(client: AsyncClient, organizer_headers: dict):
    """Expense amount and status can be updated."""
    event_id = await _create_event(client, organizer_headers)
    cat = await _create_budget_category(client, organizer_headers, event_id)
    expense = await _create_expense(client, organizer_headers, event_id, cat["id"])

    r = await client.put(
        f"/api/v1/budget/expense/{expense['id']}",
        json={"amount_mad": 75_000, "status": "paid"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert r.json()["amount_mad"] == 75_000
    assert r.json()["status"] == "paid"


async def test_update_expense_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.put(
        f"/api/v1/budget/expense/{NONEXISTENT_ID}",
        json={"amount_mad": 5_000},
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ── DELETE /api/v1/budget/expense/{id} ────────────────────────────────────────

async def test_delete_expense_soft(client: AsyncClient, organizer_headers: dict):
    """Deleting expense sets status to 'cancelled' (soft delete)."""
    event_id = await _create_event(client, organizer_headers)
    cat = await _create_budget_category(client, organizer_headers, event_id)
    expense = await _create_expense(client, organizer_headers, event_id, cat["id"])

    r = await client.delete(
        f"/api/v1/budget/expense/{expense['id']}", headers=organizer_headers
    )
    assert r.status_code == 200
    assert "cancelled" in r.json()["message"].lower()

    # Cancelled expenses are excluded from spent totals
    overview = await client.get(f"/api/v1/budget/{event_id}", headers=organizer_headers)
    assert overview.json()["total_spent_mad"] == 0


async def test_delete_expense_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.delete(
        f"/api/v1/budget/expense/{NONEXISTENT_ID}", headers=organizer_headers
    )
    assert r.status_code == 404


# ── GET /api/v1/budget/{event_id}/variance ────────────────────────────────────

async def test_variance_report_structure(client: AsyncClient, organizer_headers: dict):
    """Variance report returns list of BudgetVarianceItem."""
    event_id = await _create_event(client, organizer_headers)
    cat = await _create_budget_category(
        client, organizer_headers, event_id, name="Communication", budget=200_000
    )
    await _create_expense(client, organizer_headers, event_id, cat["id"], amount=80_000)

    r = await client.get(f"/api/v1/budget/{event_id}/variance", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1

    item = data[0]
    assert "category" in item
    assert "budget_mad" in item
    assert "spent_mad" in item
    assert "variance_mad" in item
    assert "variance_pct" in item
    assert item["variance_mad"] == item["budget_mad"] - item["spent_mad"]


async def test_variance_positive_when_under_budget(client: AsyncClient, organizer_headers: dict):
    """Variance is positive when spent < budget."""
    event_id = await _create_event(client, organizer_headers)
    cat = await _create_budget_category(
        client, organizer_headers, event_id, name="Marketing", budget=400_000
    )
    await _create_expense(client, organizer_headers, event_id, cat["id"], amount=100_000)

    r = await client.get(f"/api/v1/budget/{event_id}/variance", headers=organizer_headers)
    item = r.json()[0]
    assert item["variance_mad"] == 300_000   # under budget
    assert item["variance_pct"] > 0


# ── GET /api/v1/budget/{event_id}/forecast ────────────────────────────────────

async def test_budget_forecast_structure(client: AsyncClient, organizer_headers: dict):
    """Forecast returns the expected schema fields."""
    event_id = await _create_event(client, organizer_headers)
    cat = await _create_budget_category(
        client, organizer_headers, event_id, name="Technique", budget=300_000
    )
    await _create_expense(client, organizer_headers, event_id, cat["id"], amount=100_000)

    r = await client.get(f"/api/v1/budget/{event_id}/forecast", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()

    assert "total_budget_mad" in data
    assert "total_committed_mad" in data
    assert "forecast_final_mad" in data
    assert "remaining_mad" in data
    assert "categories" in data
    # forecast ≥ committed (10 % added)
    assert data["forecast_final_mad"] >= data["total_committed_mad"]


# ═══════════════════════════════════════════════════════════════════════════════
# FINANCE DASHBOARD ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ── GET /api/v1/finance/dashboard/{event_id} ──────────────────────────────────

async def test_finance_dashboard_empty_event(client: AsyncClient, organizer_headers: dict):
    """Dashboard for a new event has all-zero financials."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(f"/api/v1/finance/dashboard/{event_id}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()

    assert data["event_id"] == event_id
    assert data["revenue_confirmed_mad"] == 0
    assert data["budget_total_mad"] == 0
    assert data["expenses_committed_mad"] == 0
    assert data["roi_percent"] == 0.0
    assert data["occupancy_rate"] == 0.0
    assert isinstance(data["revenue_by_source"], list)
    assert isinstance(data["budget_by_category"], list)


async def test_finance_dashboard_with_payments(client: AsyncClient, organizer_headers: dict):
    """Dashboard reflects paid payments in revenue_confirmed_mad."""
    event_id = await _create_event(client, organizer_headers)

    # Two paid payments
    await _create_payment(client, organizer_headers, event_id, amount=500_000, source="stands")
    await _create_payment(client, organizer_headers, event_id, amount=200_000, source="sponsoring")
    # One pending (should NOT count in confirmed)
    await _create_payment(client, organizer_headers, event_id, amount=100_000, status="pending")

    r = await client.get(f"/api/v1/finance/dashboard/{event_id}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()

    assert data["revenue_confirmed_mad"] == 700_000   # 500k + 200k only


async def test_finance_dashboard_roi_calculation(client: AsyncClient, organizer_headers: dict):
    """ROI = (revenue - budget) / budget * 100."""
    event_id = await _create_event(client, organizer_headers)

    # Set up budget category: 400_000 MAD
    cat = await _create_budget_category(
        client, organizer_headers, event_id, name="Logistique", budget=400_000
    )

    # Revenue: 600_000 MAD confirmed
    await _create_payment(client, organizer_headers, event_id, amount=600_000, source="stands")

    r = await client.get(f"/api/v1/finance/dashboard/{event_id}", headers=organizer_headers)
    data = r.json()

    # ROI = (600_000 - 400_000) / 400_000 * 100 = 50.0
    assert data["budget_total_mad"] == 400_000
    assert data["revenue_confirmed_mad"] == 600_000
    assert abs(data["roi_percent"] - 50.0) < 0.5


async def test_finance_dashboard_revenue_by_source(client: AsyncClient, organizer_headers: dict):
    """Revenue by source groups paid payments correctly."""
    event_id = await _create_event(client, organizer_headers)
    await _create_payment(client, organizer_headers, event_id, amount=300_000, source="stands")
    await _create_payment(client, organizer_headers, event_id, amount=100_000, source="sponsoring")

    r = await client.get(f"/api/v1/finance/dashboard/{event_id}", headers=organizer_headers)
    data = r.json()

    sources = {item["source"]: item for item in data["revenue_by_source"]}
    assert "stands" in sources
    assert sources["stands"]["amount_mad"] == 300_000
    assert "sponsoring" in sources
    assert sources["sponsoring"]["amount_mad"] == 100_000

    # Percentages sum to ~100
    total_pct = sum(item["percentage"] for item in data["revenue_by_source"])
    assert abs(total_pct - 100.0) < 1.0


async def test_finance_dashboard_budget_by_category(client: AsyncClient, organizer_headers: dict):
    """Budget by category shows spend vs. allocated."""
    event_id = await _create_event(client, organizer_headers)
    cat = await _create_budget_category(
        client, organizer_headers, event_id, name="Restauration", budget=250_000
    )
    await _create_expense(client, organizer_headers, event_id, cat["id"], amount=110_000)

    r = await client.get(f"/api/v1/finance/dashboard/{event_id}", headers=organizer_headers)
    data = r.json()
    cats = {c["category"]: c for c in data["budget_by_category"]}

    assert "Restauration" in cats
    assert cats["Restauration"]["budget_mad"] == 250_000
    assert cats["Restauration"]["spent_mad"] == 110_000
    assert cats["Restauration"]["variance_mad"] == 140_000


async def test_finance_dashboard_not_found(client: AsyncClient, organizer_headers: dict):
    """Dashboard for unknown event returns 404."""
    r = await client.get(f"/api/v1/finance/dashboard/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404


async def test_finance_dashboard_visitor_forbidden(
    client: AsyncClient, organizer_headers: dict, visitor_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(f"/api/v1/finance/dashboard/{event_id}", headers=visitor_headers)
    assert r.status_code == 403


# ── GET /api/v1/finance/kpis/{event_id} ───────────────────────────────────────

async def test_finance_kpis_structure(client: AsyncClient, organizer_headers: dict):
    """KPI endpoint returns the expected fields."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(f"/api/v1/finance/kpis/{event_id}", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()

    required_keys = {
        "event_id", "event_name", "revenue_confirmed_mad", "budget_total_mad",
        "expenses_committed_mad", "result_forecast_mad", "roi_percent", "occupancy_rate",
    }
    assert required_keys.issubset(set(data.keys()))
    assert isinstance(data["roi_percent"], float)
    assert isinstance(data["occupancy_rate"], float)


# ── GET /api/v1/finance/revenue-by-source/{event_id} ─────────────────────────

async def test_revenue_by_source_endpoint(client: AsyncClient, organizer_headers: dict):
    """Revenue-by-source endpoint returns list of source breakdowns."""
    event_id = await _create_event(client, organizer_headers)
    await _create_payment(client, organizer_headers, event_id, amount=150_000, source="partenaires")

    r = await client.get(
        f"/api/v1/finance/revenue-by-source/{event_id}", headers=organizer_headers
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert any(item["source"] == "partenaires" for item in data)


# ── GET /api/v1/finance/export.xlsx ───────────────────────────────────────────

async def test_export_excel_content_type(client: AsyncClient, organizer_headers: dict):
    """Excel export returns correct content-type and non-empty body."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/finance/export.xlsx?event_id={event_id}", headers=organizer_headers
    )
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert len(r.content) > 0


async def test_export_excel_filename_header(client: AsyncClient, organizer_headers: dict):
    """Excel response includes a Content-Disposition with .xlsx filename."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/finance/export.xlsx?event_id={event_id}", headers=organizer_headers
    )
    assert ".xlsx" in r.headers.get("content-disposition", "")


async def test_export_excel_visitor_forbidden(
    client: AsyncClient, organizer_headers: dict, visitor_headers: dict
):
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/finance/export.xlsx?event_id={event_id}", headers=visitor_headers
    )
    assert r.status_code == 403


# ── GET /api/v1/finance/export.pdf ────────────────────────────────────────────

async def test_export_pdf_content_type(client: AsyncClient, organizer_headers: dict):
    """PDF export returns application/pdf and non-empty body."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/finance/export.pdf?event_id={event_id}", headers=organizer_headers
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert len(r.content) > 1000   # real PDF is never empty


async def test_export_pdf_starts_with_pdf_header(client: AsyncClient, organizer_headers: dict):
    """PDF binary starts with the %PDF magic bytes."""
    event_id = await _create_event(client, organizer_headers)
    r = await client.get(
        f"/api/v1/finance/export.pdf?event_id={event_id}", headers=organizer_headers
    )
    assert r.content[:4] == b"%PDF"


# ═══════════════════════════════════════════════════════════════════════════════
# INVOICE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ── POST /api/v1/invoices/generate/{payment_id} ───────────────────────────────

async def test_generate_invoice(client: AsyncClient, organizer_headers: dict):
    """Generates an invoice with correct number format and TVA 20%."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=12_000)

    r = await client.post(
        f"/api/v1/invoices/generate/{payment['id']}",
        json={
            "payer_name": "Atlas Tech SARL",
            "payer_email": "billing@atlastech.ma",
            "payer_company": "Atlas Tech",
            "payer_ice": "001234567890123",
            "description": "Stand A12 — Zone Premium — 36 m²",
            "due_days": 30,
        },
        headers=organizer_headers,
    )
    assert r.status_code == 201, r.text
    inv = r.json()

    # Invoice number format: INV-YYYY-MM-NNNN
    assert inv["invoice_number"].startswith("INV-")
    parts = inv["invoice_number"].split("-")
    assert len(parts) == 4
    assert len(parts[3]) == 4   # zero-padded sequence

    # TVA back-calculation
    assert inv["amount_ttc_mad"] == 12_000
    assert inv["tva_rate"] == 20
    assert inv["amount_ht_mad"] + inv["tva_mad"] == inv["amount_ttc_mad"]
    assert inv["tva_mad"] > 0

    # Status defaults to draft
    assert inv["status"] == "draft"
    assert inv["payer_name"] == "Atlas Tech SARL"
    assert inv["payer_ice"] == "001234567890123"


async def test_generate_invoice_tva_arithmetic(client: AsyncClient, organizer_headers: dict):
    """HT + TVA = TTC, TVA ≈ TTC × 20/120."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=60_000)

    r = await client.post(
        f"/api/v1/invoices/generate/{payment['id']}",
        json={"payer_name": "Test Client", "payer_email": "test@test.ma"},
        headers=organizer_headers,
    )
    inv = r.json()
    assert inv["amount_ht_mad"] + inv["tva_mad"] == inv["amount_ttc_mad"]
    # HT ≈ 60_000 / 1.20 = 50_000
    assert abs(inv["amount_ht_mad"] - 50_000) <= 1


async def test_generate_invoice_sequence_increments(client: AsyncClient, organizer_headers: dict):
    """Second invoice for the same month gets a higher sequence number."""
    event_id = await _create_event(client, organizer_headers)
    p1 = await _create_payment(client, organizer_headers, event_id, amount=10_000)
    p2 = await _create_payment(client, organizer_headers, event_id, amount=20_000)

    r1 = await client.post(
        f"/api/v1/invoices/generate/{p1['id']}",
        json={"payer_name": "Client 1", "payer_email": "c1@test.ma"},
        headers=organizer_headers,
    )
    r2 = await client.post(
        f"/api/v1/invoices/generate/{p2['id']}",
        json={"payer_name": "Client 2", "payer_email": "c2@test.ma"},
        headers=organizer_headers,
    )
    assert r1.status_code == 201
    assert r2.status_code == 201
    seq1 = int(r1.json()["invoice_number"].split("-")[3])
    seq2 = int(r2.json()["invoice_number"].split("-")[3])
    assert seq2 > seq1


async def test_generate_invoice_duplicate_fails(client: AsyncClient, organizer_headers: dict):
    """Generating a second invoice for the same payment returns 409."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=5_000)

    for _ in range(2):
        r = await client.post(
            f"/api/v1/invoices/generate/{payment['id']}",
            json={"payer_name": "Test", "payer_email": "t@t.ma"},
            headers=organizer_headers,
        )

    assert r.status_code == 409
    assert "already exists" in r.json()["detail"].lower()


async def test_generate_invoice_payment_not_found(client: AsyncClient, organizer_headers: dict):
    """Unknown payment_id returns 404."""
    r = await client.post(
        f"/api/v1/invoices/generate/{NONEXISTENT_ID}",
        json={"payer_name": "Ghost", "payer_email": "g@g.ma"},
        headers=organizer_headers,
    )
    assert r.status_code == 404


# ── GET /api/v1/invoices ──────────────────────────────────────────────────────

async def test_list_invoices(client: AsyncClient, organizer_headers: dict):
    """List invoices returns array."""
    r = await client.get("/api/v1/invoices", headers=organizer_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_invoices_filter_by_event(client: AsyncClient, organizer_headers: dict):
    """Filtering by event_id returns only that event's invoices."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=8_000)
    await client.post(
        f"/api/v1/invoices/generate/{payment['id']}",
        json={"payer_name": "Filtered Client", "payer_email": "f@f.ma"},
        headers=organizer_headers,
    )

    r = await client.get(f"/api/v1/invoices?event_id={event_id}", headers=organizer_headers)
    assert r.status_code == 200
    for inv in r.json():
        assert inv["event_id"] == event_id


# ── GET /api/v1/invoices/{id} ─────────────────────────────────────────────────

async def test_get_invoice_by_id(client: AsyncClient, organizer_headers: dict):
    """Get full invoice detail."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=15_000)
    gen = await client.post(
        f"/api/v1/invoices/generate/{payment['id']}",
        json={"payer_name": "Detail Test", "payer_email": "d@d.ma"},
        headers=organizer_headers,
    )
    inv_id = gen.json()["id"]

    r = await client.get(f"/api/v1/invoices/{inv_id}", headers=organizer_headers)
    assert r.status_code == 200
    assert r.json()["id"] == inv_id


async def test_get_invoice_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/invoices/{NONEXISTENT_ID}", headers=organizer_headers)
    assert r.status_code == 404


# ── GET /api/v1/invoices/{id}/status ──────────────────────────────────────────

async def test_invoice_status_check(client: AsyncClient, organizer_headers: dict):
    """Status endpoint returns lightweight response."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=9_000)
    gen = await client.post(
        f"/api/v1/invoices/generate/{payment['id']}",
        json={"payer_name": "Status Test", "payer_email": "s@s.ma"},
        headers=organizer_headers,
    )
    inv_id = gen.json()["id"]

    r = await client.get(f"/api/v1/invoices/{inv_id}/status", headers=organizer_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == inv_id
    assert data["status"] == "draft"
    assert "invoice_number" in data
    assert "amount_ttc_mad" in data


# ── POST /api/v1/invoices/{id}/send-email ─────────────────────────────────────

async def test_send_invoice_email(client: AsyncClient, organizer_headers: dict):
    """Send-email marks invoice as 'sent'."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=20_000)
    gen = await client.post(
        f"/api/v1/invoices/generate/{payment['id']}",
        json={"payer_name": "Email Test", "payer_email": "email@test.ma"},
        headers=organizer_headers,
    )
    inv_id = gen.json()["id"]

    r = await client.post(
        f"/api/v1/invoices/{inv_id}/send-email",
        json={"message": "Veuillez trouver votre facture en pièce jointe."},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "sent" in data["message"].lower()
    assert "invoice_number" in data

    # Status should now be 'sent'
    status_r = await client.get(f"/api/v1/invoices/{inv_id}/status", headers=organizer_headers)
    assert status_r.json()["status"] == "sent"


async def test_send_invoice_email_override_address(client: AsyncClient, organizer_headers: dict):
    """Optional email override sends to a different address."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=7_000)
    gen = await client.post(
        f"/api/v1/invoices/generate/{payment['id']}",
        json={"payer_name": "Override Test", "payer_email": "orig@test.ma"},
        headers=organizer_headers,
    )
    inv_id = gen.json()["id"]

    r = await client.post(
        f"/api/v1/invoices/{inv_id}/send-email",
        json={"email": "override@test.ma"},
        headers=organizer_headers,
    )
    assert r.status_code == 200
    assert "override@test.ma" in r.json()["recipient"]


# ── GET /api/v1/invoices/{id}/pdf ─────────────────────────────────────────────

async def test_download_invoice_pdf(client: AsyncClient, organizer_headers: dict):
    """PDF download returns application/pdf with magic bytes %PDF."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=25_000)
    gen = await client.post(
        f"/api/v1/invoices/generate/{payment['id']}",
        json={
            "payer_name": "PDF Test SARL",
            "payer_email": "pdf@test.ma",
            "payer_company": "PDF Test",
            "payer_ice": "987654321012345",
            "description": "Stand B08 — Zone Standard",
            "due_days": 30,
        },
        headers=organizer_headers,
    )
    inv_id = gen.json()["id"]

    r = await client.get(f"/api/v1/invoices/{inv_id}/pdf", headers=organizer_headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 2000


async def test_download_invoice_pdf_filename(client: AsyncClient, organizer_headers: dict):
    """PDF response Content-Disposition contains invoice number."""
    event_id = await _create_event(client, organizer_headers)
    payment = await _create_payment(client, organizer_headers, event_id, amount=11_000)
    gen = await client.post(
        f"/api/v1/invoices/generate/{payment['id']}",
        json={"payer_name": "FN Test", "payer_email": "fn@test.ma"},
        headers=organizer_headers,
    )
    inv = gen.json()
    inv_id = inv["id"]
    inv_number = inv["invoice_number"]

    r = await client.get(f"/api/v1/invoices/{inv_id}/pdf", headers=organizer_headers)
    cd = r.headers.get("content-disposition", "")
    assert inv_number in cd
    assert ".pdf" in cd


async def test_download_invoice_pdf_not_found(client: AsyncClient, organizer_headers: dict):
    r = await client.get(f"/api/v1/invoices/{NONEXISTENT_ID}/pdf", headers=organizer_headers)
    assert r.status_code == 404


# ── Full finance integration flow ──────────────────────────────────────────────

async def test_full_finance_lifecycle(client: AsyncClient, organizer_headers: dict):
    """
    End-to-end finance lifecycle:
    create event → set budget → add expenses → record payments →
    check dashboard → generate invoice → download PDF → verify KPIs.
    """
    # 1. Create event
    event_id = await _create_event(client, organizer_headers)

    # 2. Set up budget categories
    log_cat = await _create_budget_category(
        client, organizer_headers, event_id, name="Logistique", budget=600_000
    )
    com_cat = await _create_budget_category(
        client, organizer_headers, event_id, name="Communication", budget=400_000
    )

    # 3. Add expenses
    await _create_expense(client, organizer_headers, event_id, log_cat["id"], amount=250_000)
    await _create_expense(client, organizer_headers, event_id, com_cat["id"], amount=380_000)

    # 4. Record paid payments
    p1 = await _create_payment(
        client, organizer_headers, event_id, amount=800_000, source="stands"
    )
    p2 = await _create_payment(
        client, organizer_headers, event_id, amount=250_000, source="sponsoring"
    )

    # 5. Check financial dashboard
    r = await client.get(f"/api/v1/finance/dashboard/{event_id}", headers=organizer_headers)
    assert r.status_code == 200
    dash = r.json()

    assert dash["revenue_confirmed_mad"] == 1_050_000   # 800k + 250k
    assert dash["budget_total_mad"] == 1_000_000         # 600k + 400k
    assert dash["expenses_committed_mad"] == 630_000     # 250k + 380k
    assert dash["roi_percent"] == 5.0                    # (1_050_000 - 1_000_000) / 1_000_000 * 100
    assert len(dash["revenue_by_source"]) == 2
    assert len(dash["budget_by_category"]) == 2

    # 6. Variance report
    vr = await client.get(f"/api/v1/budget/{event_id}/variance", headers=organizer_headers)
    assert vr.status_code == 200
    variances = {v["category"]: v for v in vr.json()}
    assert variances["Logistique"]["variance_mad"] == 350_000   # 600k - 250k
    assert variances["Communication"]["variance_mad"] == 20_000  # 400k - 380k

    # 7. Generate invoice
    inv_r = await client.post(
        f"/api/v1/invoices/generate/{p1['id']}",
        json={
            "payer_name": "Atlas Expo SARL",
            "payer_email": "finance@atlasexpo.ma",
            "payer_company": "Atlas Expo",
            "payer_ice": "001122334455667",
            "description": "Stand Hall A — Zone Gold — 72 m²",
            "due_days": 30,
        },
        headers=organizer_headers,
    )
    assert inv_r.status_code == 201
    inv = inv_r.json()
    assert inv["amount_ttc_mad"] == 800_000
    assert inv["invoice_number"].startswith("INV-2026")

    # 8. Download PDF
    pdf_r = await client.get(f"/api/v1/invoices/{inv['id']}/pdf", headers=organizer_headers)
    assert pdf_r.status_code == 200
    assert pdf_r.content[:4] == b"%PDF"

    # 9. KPI check
    kpi_r = await client.get(f"/api/v1/finance/kpis/{event_id}", headers=organizer_headers)
    assert kpi_r.status_code == 200
    kpis = kpi_r.json()
    assert kpis["revenue_confirmed_mad"] == 1_050_000
    assert kpis["roi_percent"] == 5.0
