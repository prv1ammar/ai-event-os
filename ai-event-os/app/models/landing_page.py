"""
app/models/landing_page.py
──────────────────────────
Event landing pages + per-visit analytics rows.

LandingPage   — configurable page (title, hero image, CTA) linked to an event
LandingPageVisit — one row per tracked page view (pixel endpoint)
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class LandingPage(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "landing_pages"

    title = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    hero_image_url = Column(String(512), nullable=True)
    cta_text = Column(String(100), nullable=True, default="S'inscrire maintenant")
    is_active = Column(Boolean, nullable=False, default=True)
    visits_count = Column(Integer, nullable=False, default=0)
    registrations_count = Column(Integer, nullable=False, default=0)

    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # backref dynamically adds `landing_pages` attribute to Event instances
    event = relationship("Event", backref="landing_pages")
    page_visits = relationship(
        "LandingPageVisit",
        back_populates="landing_page",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<LandingPage {self.slug!r} active={self.is_active}>"


class LandingPageVisit(Base, UUIDMixin):
    __tablename__ = "landing_page_visits"

    landing_page_id = Column(
        UUID(as_uuid=True),
        ForeignKey("landing_pages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(512), nullable=True)
    referrer = Column(String(512), nullable=True)
    visited_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    landing_page = relationship("LandingPage", back_populates="page_visits")

    def __repr__(self) -> str:
        return f"<LandingPageVisit page={self.landing_page_id} at={self.visited_at}>"
