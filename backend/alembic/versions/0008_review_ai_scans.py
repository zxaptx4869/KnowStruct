"""Add review scans and AI findings, extend resolution target types."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_review_ai_scans"
down_revision: str | None = "0007_review_resolutions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "review_scans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "workspace_id",
            sa.String(length=36),
            nullable=False,
        ),
        sa.Column("scope_type", sa.String(length=20), nullable=False),
        sa.Column("scope_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("truncated", sa.Boolean(), nullable=False),
        sa.Column("findings_count", sa.Integer(), nullable=False),
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
            "scope_type IN ('workspace', 'project', 'node')",
            name="ck_review_scans_scope_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed')",
            name="ck_review_scans_status",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_review_scans_workspace_status",
        "review_scans",
        ["workspace_id", "status"],
    )

    op.create_table(
        "review_ai_findings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "workspace_id",
            sa.String(length=36),
            nullable=False,
        ),
        sa.Column("scan_id", sa.String(length=36), nullable=False),
        sa.Column("review_type", sa.String(length=20), nullable=False),
        sa.Column("entry_a_id", sa.String(length=36), nullable=False),
        sa.Column("entry_b_id", sa.String(length=36), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("suggestion", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
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
            "review_type IN ('duplicate', 'conflict')",
            name="ck_review_ai_findings_type",
        ),
        sa.CheckConstraint(
            "status IN ('candidate', 'open', 'rejected')",
            name="ck_review_ai_findings_status",
        ),
        sa.CheckConstraint(
            "severity IN ('info', 'warning', 'error')",
            name="ck_review_ai_findings_severity",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["scan_id"],
            ["review_scans.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["entry_a_id"],
            ["entries.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["entry_b_id"],
            ["entries.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id",
            "review_type",
            "entry_a_id",
            "entry_b_id",
            name="uq_review_ai_findings_pair",
        ),
    )
    op.create_index(
        "ix_review_ai_findings_workspace_status",
        "review_ai_findings",
        ["workspace_id", "status"],
    )

    with op.batch_alter_table("review_resolutions") as batch_op:
        batch_op.drop_constraint(
            "ck_review_resolutions_finding_type",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_review_resolutions_finding_type",
            "finding_type IN ('missing_source', 'missing_conditions', 'long_pending', 'duplicate', 'conflict')",
        )
        batch_op.drop_constraint(
            "ck_review_resolutions_target_type",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_review_resolutions_target_type",
            "target_type IN ('entry', 'source', 'ai_finding')",
        )


def downgrade() -> None:
    with op.batch_alter_table("review_resolutions") as batch_op:
        batch_op.drop_constraint(
            "ck_review_resolutions_finding_type",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_review_resolutions_finding_type",
            "finding_type IN ('missing_source', 'missing_conditions', 'long_pending')",
        )
        batch_op.drop_constraint(
            "ck_review_resolutions_target_type",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_review_resolutions_target_type",
            "target_type IN ('entry', 'source')",
        )

    op.drop_index(
        "ix_review_ai_findings_workspace_status",
        table_name="review_ai_findings",
    )
    op.drop_table("review_ai_findings")
    op.drop_index(
        "ix_review_scans_workspace_status",
        table_name="review_scans",
    )
    op.drop_table("review_scans")
