"""Create capture inbox, processing task, extraction, entry, and link tables."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_capture_text_to_entry"
down_revision: str | None = "0002_project_tree"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sources",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=True),
        sa.Column("source_type", sa.String(length=10), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("link_url", sa.String(length=2048), nullable=True),
        sa.Column(
            "content_status",
            sa.String(length=20),
            server_default="saved",
            nullable=False,
        ),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "content_status IN ('saving', 'saved', 'unavailable', 'pending_delete')",
            name="ck_sources_content_status",
        ),
        sa.CheckConstraint("source_type IN ('text', 'link')", name="ck_sources_type"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sources_project",
        "sources",
        ["project_id"],
    )
    op.create_index(
        "ix_sources_workspace_created",
        "sources",
        ["workspace_id", "created_at"],
    )

    op.create_table(
        "processing_tasks",
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column(
            "stage",
            sa.String(length=30),
            server_default="ai_extraction",
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("attempt_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("attempt_count >= 1", name="ck_processing_tasks_attempts"),
        sa.CheckConstraint(
            "stage IN ('ai_extraction')",
            name="ck_processing_tasks_stage",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed')",
            name="ck_processing_tasks_status",
        ),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_id", name="uq_processing_tasks_source"),
    )
    op.create_index(
        "ix_processing_tasks_status_claimed",
        "processing_tasks",
        ["status", "claimed_at"],
    )

    op.create_table(
        "extractions",
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default="pending_confirm",
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("entry_type", sa.String(length=30), nullable=False),
        sa.Column("suggested_node_path", sa.String(length=500), nullable=True),
        sa.Column("applicable_conditions", sa.JSON(), nullable=True),
        sa.Column("key_params", sa.JSON(), nullable=True),
        sa.Column("risk_points", sa.JSON(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name="ck_extractions_confidence",
        ),
        sa.CheckConstraint(
            "entry_type IN ('experience', 'parameter', 'pitfall', 'product', "
            "'price', 'decision', 'todo', 'question')",
            name="ck_extractions_entry_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending_confirm', 'accepted', 'rejected')",
            name="ck_extractions_status",
        ),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_extractions_source", "extractions", ["source_id"])
    op.create_index(
        "ix_extractions_workspace_status",
        "extractions",
        ["workspace_id", "status"],
    )

    op.create_table(
        "entries",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("node_id", sa.String(length=36), nullable=True),
        sa.Column("extraction_id", sa.String(length=36), nullable=True),
        sa.Column("entry_type", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default="archived",
            nullable=False,
        ),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "entry_type IN ('experience', 'parameter', 'pitfall', 'product', "
            "'price', 'decision', 'todo', 'question')",
            name="ck_entries_entry_type",
        ),
        sa.CheckConstraint(
            "status IN ('archived', 'conflict')",
            name="ck_entries_status",
        ),
        sa.ForeignKeyConstraint(["extraction_id"], ["extractions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_entries_node", "entries", ["node_id"])
    op.create_index("ix_entries_project", "entries", ["project_id"])
    op.create_index(
        "ix_entries_workspace_created",
        "entries",
        ["workspace_id", "created_at"],
    )
    op.create_index("ix_entries_extraction_id", "entries", ["extraction_id"], unique=True)

    op.create_table(
        "entry_sources",
        sa.Column("entry_id", sa.String(length=36), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("entry_id", "source_id"),
    )
    op.create_index("ix_entry_sources_source", "entry_sources", ["source_id"])


def downgrade() -> None:
    op.drop_table("entry_sources")
    op.drop_table("entries")
    op.drop_table("extractions")
    op.drop_table("processing_tasks")
    op.drop_table("sources")
