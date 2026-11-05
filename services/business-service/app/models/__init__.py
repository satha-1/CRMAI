# shortcut: these map tables that auth-service's migrations create in the shared database. Decide who owns them in ADR-011 before splitting the database.
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow

CHANNEL_CODES = ("website", "email", "whatsapp", "facebook", "instagram", "voice")

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(32), unique=True)
    permissions: Mapped[list[Permission]] = relationship(secondary=role_permissions)


class User(Base):
    """Accounts are created by auth-service. This service never reads or writes passwords."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user", foreign_keys="Membership.user_id")


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
    """A person's place in one company. Role, status, and manager never affect their other companies."""

    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "organization_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    user: Mapped[User] = relationship(back_populates="memberships", foreign_keys=[user_id])
    organization: Mapped[Organization] = relationship()
    role: Mapped[Role] = relationship()
