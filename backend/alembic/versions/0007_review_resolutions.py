"""Add review_resolutions table."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_review_resolutions"
down_revision: str | None = "0006_entries_conditions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "review_resolutions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "workspace_id",
            sa.String(length=36),
            nullable=False,
        ),
        sa.Column("finding_type", sa.String(length=30), nullable=False),
        sa.Column("target_type", sa.String(length=10), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=False),
        sa.Column("resolution", sa.String(length=10), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "finding_type IN ('missing_source', 'missing_conditions', 'long_pending')",
            name="ck_review_resolutions_finding_type",
        ),
        sa.CheckConstraint(
            "target_type IN ('entry', 'source')",
            name="ck_review_resolutions_target_type",
        ),
        sa.CheckConstraint(
            "resolution IN ('resolved', 'ignored')",
            name="ck_review_resolutions_resolution",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id",
            "finding_type",
            "target_type",
            "target_id",
            name="uq_review_resolutions_finding",
        ),
    )
    op.create_index(
        "ix_review_resolutions_workspace",
        "review_resolutions",
        ["workspace_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_review_resolutions_workspace",
        table_name="review_resolutions",
    )
    op.drop_table("review_resolutions")
