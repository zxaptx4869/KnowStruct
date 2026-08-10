"""Create directory draft candidate tables."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013_create_directory_drafts"
down_revision: str | None = "0012_source_fingerprints"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "directory_drafts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("next_action", sa.String(20), nullable=False),
        sa.Column("background_snapshot", sa.Text(), nullable=True),
        sa.Column("intent_note", sa.Text(), nullable=True),
        sa.Column("clarify_json", sa.Text(), nullable=True),
        sa.Column("clarify_answers_json", sa.Text(), nullable=True),
        sa.Column("refine_instruction", sa.Text(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "status IN ('drafting', 'awaiting_input', 'pending_confirm', "
            "'failed', 'confirmed', 'discarded')",
            name="ck_directory_drafts_status",
        ),
        sa.CheckConstraint(
            "next_action IN ('clarify', 'generate', 'refine')",
            name="ck_directory_drafts_next_action",
        ),
    )
    op.create_index(
        "ix_directory_drafts_project_status",
        "directory_drafts",
        ["project_id", "status"],
    )
    op.create_index(
        "ix_directory_drafts_project_id",
        "directory_drafts",
        ["project_id"],
    )

    op.create_table(
        "directory_draft_nodes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "draft_id",
            sa.String(36),
            sa.ForeignKey("directory_drafts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parent_id",
            sa.String(36),
            sa.ForeignKey("directory_draft_nodes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("normalized_name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("selected", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "sort_order >= 0",
            name="ck_directory_draft_nodes_sort",
        ),
    )
    op.create_index(
        "ix_directory_draft_nodes_draft_parent",
        "directory_draft_nodes",
        ["draft_id", "parent_id", "sort_order"],
    )
    op.create_index(
        "ix_directory_draft_nodes_draft_id",
        "directory_draft_nodes",
        ["draft_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_directory_draft_nodes_draft_id",
        table_name="directory_draft_nodes",
    )
    op.drop_index(
        "ix_directory_draft_nodes_draft_parent",
        table_name="directory_draft_nodes",
    )
    op.drop_table("directory_draft_nodes")
    op.drop_index("ix_directory_drafts_project_id", table_name="directory_drafts")
    op.drop_index(
        "ix_directory_drafts_project_status",
        table_name="directory_drafts",
    )
    op.drop_table("directory_drafts")
