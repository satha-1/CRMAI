"""Create auth tables and seed roles and permissions

Revision ID: 0001
Revises:
"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

BASE = ["customer.read", "lead.read", "followup.read", "conversation.read", "notification.read"]

# Same matrix as frontend/src/auth/permissions.ts. The server is the source of truth.
ROLES = {
    "admin": ("Adds staff and gives roles", ["user.manage", "org.manage", "notification.read"]),
    "marketing_manager": (
        "Assigns leads and calls to marketing executives",
        [
            *BASE, "customer.write", "lead.write", "lead.delete", "lead.assign.marketing", "call.log",
            "followup.write", "conversation.reply", "conversation.takeover", "escalation.read",
            "escalation.assign", "knowledge.read", "knowledge.write", "knowledge.publish",
            "analytics.read", "team.performance", "audit.read",
        ],
    ),
    "marketing_executive": (
        "Calls leads and hands interested ones to sales",
        [*BASE, "customer.write", "lead.write", "call.log", "followup.write"],
    ),
    "sales_manager": (
        "Assigns site visits and checks visit reports",
        [
            *BASE, "lead.write", "lead.assign.sales", "visit.assign", "visit.manage",
            "analytics.read", "team.performance", "audit.read",
        ],
    ),
    "sales_executive": ("Goes to site visits and writes reports", [*BASE, "lead.write", "visit.manage"]),
}


def upgrade() -> None:
    roles = op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(32), nullable=False, unique=True),
        sa.Column("description", sa.String(200), nullable=False),
    )
    permissions = op.create_table(
        "permissions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("description", sa.String(200), nullable=False),
    )
    role_permissions = op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Uuid(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", sa.Uuid(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("role_id", sa.Uuid(), sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("industry", sa.String(120), nullable=False),
        sa.Column("plan", sa.String(32), nullable=False),
        sa.Column("widget_key", sa.String(64), nullable=False, unique=True),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("product_label", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "memberships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", sa.Uuid(), sa.ForeignKey("roles.id"), nullable=False),
        sa.UniqueConstraint("user_id", "organization_id"),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.CHAR(64), nullable=False, unique=True),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])

    codes = sorted({code for _, granted in ROLES.values() for code in granted})
    permission_ids = {code: uuid.uuid4() for code in codes}
    op.bulk_insert(permissions, [{"id": permission_ids[c], "code": c, "description": c} for c in codes])
    for name, (description, granted) in ROLES.items():
        role_id = uuid.uuid4()
        op.bulk_insert(roles, [{"id": role_id, "name": name, "description": description}])
        op.bulk_insert(role_permissions, [{"role_id": role_id, "permission_id": permission_ids[c]} for c in granted])


def downgrade() -> None:
    for table in ("refresh_tokens", "memberships", "organizations", "users", "role_permissions", "permissions", "roles"):
        op.drop_table(table)
