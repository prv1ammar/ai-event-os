"""
app/models/campaign.py
──────────────────────
Marketing campaigns: email blasts, WhatsApp, LinkedIn, Facebook.
"""

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

CampaignChannel = Enum(
    "email", "whatsapp", "linkedin", "facebook", "sms",
    name="campaign_channel_enum",
)

CampaignStatus = Enum(
    "draft", "scheduled", "sending", "sent", "cancelled",
    name="campaign_status_enum",
)

AudienceType = Enum(
    "all_visitors", "vip", "exhibitors", "speakers", "press", "custom",
    name="audience_type_enum",
)


class Campaign(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "campaigns"

    name = Column(String(255), nullable=False)
    channel = Column(CampaignChannel, nullable=False, default="email")
    status = Column(CampaignStatus, nullable=False, default="draft")
    audience_type = Column(AudienceType, nullable=False, default="all_visitors")
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    sent_count = Column(Integer, nullable=False, default=0)
    open_rate = Column(Float, nullable=True)           # 0.0 – 1.0
    click_count = Column(Integer, nullable=False, default=0)
    leads_generated = Column(Integer, nullable=False, default=0)
    subject = Column(String(255), nullable=True)       # email subject line
    template_name = Column(String(120), nullable=True) # Jinja2 template filename

    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event = relationship("Event", back_populates="campaigns")

    def __repr__(self) -> str:
        return f"<Campaign {self.name!r} channel={self.channel} status={self.status}>"
