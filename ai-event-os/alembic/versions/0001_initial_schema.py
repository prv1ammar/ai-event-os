"""Initial schema — all core tables

Revision ID: 0001
Revises:
Create Date: 2026-05-22 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Custom ENUM types ─────────────────────────────────────────────────────
    op.execute("CREATE TYPE user_role_enum AS ENUM ('admin','organizer','exhibitor','visitor')")
    op.execute("CREATE TYPE event_status_enum AS ENUM ('draft','published','ongoing','completed','cancelled')")
    op.execute("CREATE TYPE exhibitor_status_enum AS ENUM ('pending','validated','refused','waiting_payment')")
    op.execute("CREATE TYPE exhibitor_package_enum AS ENUM ('standard','premium','gold','platinum')")
    op.execute("CREATE TYPE exhibitor_size_enum AS ENUM ('startup','sme','large','multinational')")
    op.execute("CREATE TYPE booth_status_enum AS ENUM ('available','reserved','occupied')")
    op.execute("CREATE TYPE reservation_status_enum AS ENUM ('pending','confirmed','cancelled')")
    op.execute("CREATE TYPE reservation_payment_status_enum AS ENUM ('pending','paid','partial','refunded')")
    op.execute("CREATE TYPE visitor_type_enum AS ENUM ('standard','vip','press','partner','organizer','speaker')")
    op.execute("CREATE TYPE ticket_status_enum AS ENUM ('confirmed','pending','cancelled','no_show')")
    op.execute("CREATE TYPE scan_type_enum AS ENUM ('entry','session','lounge','restaurant','booth')")
    op.execute("CREATE TYPE session_type_enum AS ENUM ('keynote','panel','workshop','roundtable','networking','demo')")
    op.execute("CREATE TYPE lead_status_enum AS ENUM ('new','contacted','qualified','opportunity','closed_won','closed_lost')")
    op.execute("CREATE TYPE meeting_status_enum AS ENUM ('pending','confirmed','done','cancelled')")
    op.execute("CREATE TYPE payment_method_enum AS ENUM ('transfer','card','cash','cmi','cheque')")
    op.execute("CREATE TYPE payment_status_enum AS ENUM ('paid','partial','pending','refunded','failed')")
    op.execute("CREATE TYPE payer_type_enum AS ENUM ('exhibitor','visitor')")
    op.execute("CREATE TYPE campaign_channel_enum AS ENUM ('email','whatsapp','linkedin','facebook','sms')")
    op.execute("CREATE TYPE campaign_status_enum AS ENUM ('draft','scheduled','sending','sent','cancelled')")
    op.execute("CREATE TYPE audience_type_enum AS ENUM ('all_visitors','vip','exhibitors','speakers','press','custom')")

    # ── events ────────────────────────────────────────────────────────────────
    op.create_table(
        "events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("venue", sa.String(255), nullable=True),
        sa.Column("city", sa.String(120), nullable=True),
        sa.Column("country", sa.String(100), nullable=True, server_default="Morocco"),
        sa.Column("capacity", sa.Integer, nullable=True),
        sa.Column("status", postgresql.ENUM("draft","published","ongoing","completed","cancelled", name="event_status_enum", create_type=False), nullable=False, server_default="draft"),
        sa.Column("category", sa.String(120), nullable=True),
        sa.Column("budget", sa.Integer, nullable=True),
        sa.Column("logo_url", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_events_id", "events", ["id"])
    op.create_index("ix_events_slug", "events", ["slug"])

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", postgresql.ENUM("admin","organizer","exhibitor","visitor", name="user_role_enum", create_type=False), nullable=False, server_default="visitor"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_event_id", "users", ["event_id"])

    # ── exhibitors ────────────────────────────────────────────────────────────
    op.create_table(
        "exhibitors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("sector", sa.String(120), nullable=True),
        sa.Column("size", postgresql.ENUM("startup","sme","large","multinational", name="exhibitor_size_enum", create_type=False), nullable=True),
        sa.Column("contact_name", sa.String(255), nullable=False),
        sa.Column("contact_email", sa.String(320), nullable=False),
        sa.Column("contact_phone", sa.String(30), nullable=True),
        sa.Column("country", sa.String(100), nullable=True, server_default="Morocco"),
        sa.Column("website", sa.String(512), nullable=True),
        sa.Column("logo_url", sa.String(512), nullable=True),
        sa.Column("package", postgresql.ENUM("standard","premium","gold","platinum", name="exhibitor_package_enum", create_type=False), nullable=True, server_default="standard"),
        sa.Column("status", postgresql.ENUM("pending","validated","refused","waiting_payment", name="exhibitor_status_enum", create_type=False), nullable=False, server_default="pending"),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_exhibitors_id", "exhibitors", ["id"])
    op.create_index("ix_exhibitors_contact_email", "exhibitors", ["contact_email"])
    op.create_index("ix_exhibitors_event_id", "exhibitors", ["event_id"])

    # ── booths ────────────────────────────────────────────────────────────────
    op.create_table(
        "booths",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("zone", sa.String(80), nullable=True),
        sa.Column("size_m2", sa.Float, nullable=True),
        sa.Column("price_mad", sa.Integer, nullable=False, server_default="0"),
        sa.Column("status", postgresql.ENUM("available","reserved","occupied", name="booth_status_enum", create_type=False), nullable=False, server_default="available"),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_booths_id", "booths", ["id"])
    op.create_index("ix_booths_event_id", "booths", ["event_id"])

    # ── booth_reservations ────────────────────────────────────────────────────
    op.create_table(
        "booth_reservations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("booth_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("booths.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exhibitor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("exhibitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("price_mad", sa.Integer, nullable=False, server_default="0"),
        sa.Column("package", sa.String(80), nullable=True),
        sa.Column("status", postgresql.ENUM("pending","confirmed","cancelled", name="reservation_status_enum", create_type=False), nullable=False, server_default="pending"),
        sa.Column("services", postgresql.JSONB, nullable=True),
        sa.Column("payment_status", postgresql.ENUM("pending","paid","partial","refunded", name="reservation_payment_status_enum", create_type=False), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_booth_reservations_id", "booth_reservations", ["id"])
    op.create_index("ix_booth_reservations_booth_id", "booth_reservations", ["booth_id"])
    op.create_index("ix_booth_reservations_exhibitor_id", "booth_reservations", ["exhibitor_id"])

    # ── visitors ──────────────────────────────────────────────────────────────
    op.create_table(
        "visitors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("first_name", sa.String(120), nullable=False),
        sa.Column("last_name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("role", sa.String(120), nullable=True),
        sa.Column("type", postgresql.ENUM("standard","vip","press","partner","organizer","speaker", name="visitor_type_enum", create_type=False), nullable=False, server_default="standard"),
        sa.Column("country", sa.String(100), nullable=True, server_default="Morocco"),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_visitors_id", "visitors", ["id"])
    op.create_index("ix_visitors_email", "visitors", ["email"])
    op.create_index("ix_visitors_event_id", "visitors", ["event_id"])

    # ── tickets ───────────────────────────────────────────────────────────────
    op.create_table(
        "tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(100), nullable=False, unique=True),
        sa.Column("pack", sa.String(80), nullable=True),
        sa.Column("status", postgresql.ENUM("confirmed","pending","cancelled","no_show", name="ticket_status_enum", create_type=False), nullable=False, server_default="pending"),
        sa.Column("qr_data", sa.Text, nullable=True),
        sa.Column("visitor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tickets_id", "tickets", ["id"])
    op.create_index("ix_tickets_code", "tickets", ["code"])
    op.create_index("ix_tickets_visitor_id", "tickets", ["visitor_id"])
    op.create_index("ix_tickets_event_id", "tickets", ["event_id"])

    # ── qr_scans ──────────────────────────────────────────────────────────────
    op.create_table(
        "qr_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("visitor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scan_type", postgresql.ENUM("entry","session","lounge","restaurant","booth", name="scan_type_enum", create_type=False), nullable=False, server_default="entry"),
        sa.Column("zone", sa.String(120), nullable=True),
        sa.Column("device_id", sa.String(120), nullable=True),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_qr_scans_id", "qr_scans", ["id"])
    op.create_index("ix_qr_scans_ticket_id", "qr_scans", ["ticket_id"])
    op.create_index("ix_qr_scans_visitor_id", "qr_scans", ["visitor_id"])
    op.create_index("ix_qr_scans_event_id", "qr_scans", ["event_id"])

    # ── sessions ──────────────────────────────────────────────────────────────
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("session_type", postgresql.ENUM("keynote","panel","workshop","roundtable","networking","demo", name="session_type_enum", create_type=False), nullable=False, server_default="keynote"),
        sa.Column("room", sa.String(120), nullable=True),
        sa.Column("capacity", sa.Integer, nullable=True),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sessions_id", "sessions", ["id"])
    op.create_index("ix_sessions_event_id", "sessions", ["event_id"])

    # ── speakers ──────────────────────────────────────────────────────────────
    op.create_table(
        "speakers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("first_name", sa.String(120), nullable=False),
        sa.Column("last_name", sa.String(120), nullable=False),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("bio", sa.Text, nullable=True),
        sa.Column("expertise", sa.String(255), nullable=True),
        sa.Column("linkedin_url", sa.String(512), nullable=True),
        sa.Column("photo_url", sa.String(512), nullable=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_speakers_id", "speakers", ["id"])
    op.create_index("ix_speakers_event_id", "speakers", ["event_id"])

    # ── session_speakers (M2M) ────────────────────────────────────────────────
    op.create_table(
        "session_speakers",
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("speaker_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("speakers.id", ondelete="CASCADE"), primary_key=True),
    )

    # ── leads ─────────────────────────────────────────────────────────────────
    op.create_table(
        "leads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("status", postgresql.ENUM("new","contacted","qualified","opportunity","closed_won","closed_lost", name="lead_status_enum", create_type=False), nullable=False, server_default="new"),
        sa.Column("score", sa.Integer, nullable=True, server_default="0"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("budget_range", sa.String(80), nullable=True),
        sa.Column("visitor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exhibitor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("exhibitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_leads_id", "leads", ["id"])
    op.create_index("ix_leads_visitor_id", "leads", ["visitor_id"])
    op.create_index("ix_leads_exhibitor_id", "leads", ["exhibitor_id"])
    op.create_index("ix_leads_event_id", "leads", ["event_id"])

    # ── meetings ──────────────────────────────────────────────────────────────
    op.create_table(
        "meetings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_min", sa.Integer, nullable=False, server_default="30"),
        sa.Column("status", postgresql.ENUM("pending","confirmed","done","cancelled", name="meeting_status_enum", create_type=False), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("visitor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exhibitor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("exhibitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_meetings_id", "meetings", ["id"])
    op.create_index("ix_meetings_visitor_id", "meetings", ["visitor_id"])
    op.create_index("ix_meetings_exhibitor_id", "meetings", ["exhibitor_id"])
    op.create_index("ix_meetings_event_id", "meetings", ["event_id"])

    # ── payments ──────────────────────────────────────────────────────────────
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("amount_mad", sa.Integer, nullable=False),
        sa.Column("method", postgresql.ENUM("transfer","card","cash","cmi","cheque", name="payment_method_enum", create_type=False), nullable=False, server_default="transfer"),
        sa.Column("status", postgresql.ENUM("paid","partial","pending","refunded","failed", name="payment_status_enum", create_type=False), nullable=False, server_default="pending"),
        sa.Column("reference", sa.String(120), nullable=True, unique=True),
        sa.Column("payer_type", postgresql.ENUM("exhibitor","visitor", name="payer_type_enum", create_type=False), nullable=False),
        sa.Column("payer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_payments_id", "payments", ["id"])
    op.create_index("ix_payments_event_id", "payments", ["event_id"])

    # ── campaigns ─────────────────────────────────────────────────────────────
    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("channel", postgresql.ENUM("email","whatsapp","linkedin","facebook","sms", name="campaign_channel_enum", create_type=False), nullable=False, server_default="email"),
        sa.Column("status", postgresql.ENUM("draft","scheduled","sending","sent","cancelled", name="campaign_status_enum", create_type=False), nullable=False, server_default="draft"),
        sa.Column("audience_type", postgresql.ENUM("all_visitors","vip","exhibitors","speakers","press","custom", name="audience_type_enum", create_type=False), nullable=False, server_default="all_visitors"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("open_rate", sa.Float, nullable=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_campaigns_id", "campaigns", ["id"])
    op.create_index("ix_campaigns_event_id", "campaigns", ["event_id"])

    # ── session_attendances ───────────────────────────────────────────────────
    op.create_table(
        "session_attendances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("visitor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("visitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("session_id", "visitor_id", name="uq_session_attendance"),
    )
    op.create_index("ix_session_attendances_id", "session_attendances", ["id"])
    op.create_index("ix_session_attendances_session_id", "session_attendances", ["session_id"])
    op.create_index("ix_session_attendances_visitor_id", "session_attendances", ["visitor_id"])


def downgrade() -> None:
    # Drop tables in reverse FK order
    op.drop_table("session_attendances")
    op.drop_table("campaigns")
    op.drop_table("payments")
    op.drop_table("meetings")
    op.drop_table("leads")
    op.drop_table("session_speakers")
    op.drop_table("speakers")
    op.drop_table("sessions")
    op.drop_table("qr_scans")
    op.drop_table("tickets")
    op.drop_table("visitors")
    op.drop_table("booth_reservations")
    op.drop_table("booths")
    op.drop_table("exhibitors")
    op.drop_table("users")
    op.drop_table("events")

    # Drop custom ENUM types
    for enum_name in [
        "audience_type_enum", "campaign_status_enum", "campaign_channel_enum",
        "payer_type_enum", "payment_status_enum", "payment_method_enum",
        "meeting_status_enum", "lead_status_enum",
        "session_type_enum", "scan_type_enum", "ticket_status_enum",
        "visitor_type_enum", "reservation_payment_status_enum",
        "reservation_status_enum", "booth_status_enum",
        "exhibitor_size_enum", "exhibitor_package_enum", "exhibitor_status_enum",
        "event_status_enum", "user_role_enum",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
