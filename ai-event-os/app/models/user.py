"""
app/models/user.py
──────────────────
Platform users: admins, organizers, exhibitor contacts, visitors.
"""

import uuid

from sqlalchemy import Boolean, Column, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

UserRole = Enum(
    "admin", "organizer", "exhibitor", "visitor",
    name="user_role_enum",
)


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email = Column(String(320), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(UserRole, nullable=False, default="visitor")
    is_active = Column(Boolean, nullable=False, default=True)

    # Optional link to a specific event (e.g. an exhibitor user)
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # relationships (back-populated by other models)
    event = relationship("Event", back_populates="users", foreign_keys=[event_id])

    def __repr__(self) -> str:
        return f"<User {self.email} role={self.role}>"
