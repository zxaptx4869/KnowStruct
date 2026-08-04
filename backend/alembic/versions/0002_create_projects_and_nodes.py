"""Create workspace projects and adjacency-list directory nodes."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002_project_tree"
down_revision: str | None = "0001_auth"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("goal", sa.String(length=500), nullable=True),
        sa.Column("background", sa.String(length=2000), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default="planning",
            nullable=False,
        ),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('planning', 'active', 'paused', 'completed')",
            name="ck_projects_status",
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_projects_workspace_id", "projects", ["workspace_id"])
    op.create_index(
        "ix_projects_workspace_updated",
        "projects",
        ["workspace_id", "updated_at"],
    )

    op.create_table(
        "nodes",
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("parent_id", sa.String(length=36), nullable=True),
        sa.Column("sibling_scope", sa.String(length=45), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("sort_order >= 0", name="ck_nodes_sort_order_nonnegative"),
        sa.ForeignKeyConstraint(["parent_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id",
            "sibling_scope",
            "normalized_name",
            name="uq_nodes_sibling_name",
        ),
    )
    op.create_index("ix_nodes_parent_id", "nodes", ["parent_id"])
    op.create_index("ix_nodes_project_id", "nodes", ["project_id"])
    op.create_index(
        "ix_nodes_project_parent_order",
        "nodes",
        ["project_id", "parent_id", "sort_order"],
    )


def downgrade() -> None:
    op.drop_table("nodes")
    op.drop_table("projects")
