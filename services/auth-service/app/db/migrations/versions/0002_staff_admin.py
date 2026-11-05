"""Add per-company staff status, reporting lines, and channel settings

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("memberships", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column(
        "memberships",
        sa.Column("manager_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_table(
        "organization_channels",
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("code", sa.String(32), primary_key=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("organization_channels")
    op.drop_column("memberships", "manager_id")
    op.drop_column("memberships", "is_active")
