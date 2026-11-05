import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow
from app.models.user import Role, User


CHANNEL_CODES = ("website", "email", "whatsapp", "facebook", "instagram", "voice")


class OrganizationChannel(Base):
    __tablename__ = "organization_channels"

    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    industry: Mapped[str] = mapped_column(String(120))
    plan: Mapped[str] = mapped_column(String(32), default="trial")
    widget_key: Mapped[str] = mapped_column(String(64), unique=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Colombo")
    product_label: Mapped[str] = mapped_column(String(64), default="package")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    channel_settings: Mapped[list[OrganizationChannel]] = relationship(cascade="all, delete-orphan")

    @property
    def channels(self) -> list[dict]:
        # Only the website widget is on until an admin changes a channel.
        saved = {c.code: c.is_enabled for c in self.channel_settings}
        return [{"code": code, "is_enabled": saved.get(code, code == "website")} for code in CHANNEL_CODES]


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "organization_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"))
    # Staff status and reporting line belong to each company, so one company cannot affect another.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    user: Mapped[User] = relationship(back_populates="memberships", foreign_keys=[user_id])
    organization: Mapped[Organization] = relationship()
    role: Mapped[Role] = relationship()
