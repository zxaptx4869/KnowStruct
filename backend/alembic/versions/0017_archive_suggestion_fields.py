"""Add recommended project fields to sources and suggestion confidence to extractions."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017_archive_suggestion_fields"
down_revision: str | None = "0016_add_draft_target_node"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("sources") as batch_op:
        batch_op.add_column(
            sa.Column(
                "recommended_project_id",
                sa.String(length=36),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column("recommended_confidence", sa.Float(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("recommended_reason", sa.String(length=500), nullable=True)
        )
        batch_op.add_column(sa.Column("recommended_at", sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(
            "fk_sources_recommended_project",
            "projects",
            ["recommended_project_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_sources_recommended_project",
            ["recommended_project_id"],
        )
    with op.batch_alter_table("extractions") as batch_op:
        batch_op.add_column(
            sa.Column("suggested_node_confidence", sa.Float(), nullable=True)
        )
        batch_op.create_check_constraint(
            "ck_extractions_suggested_node_confidence",
            "suggested_node_confidence >= 0 AND suggested_node_confidence <= 1",
        )


def downgrade() -> None:
    with op.batch_alter_table("extractions") as batch_op:
        batch_op.drop_constraint(
            "ck_extractions_suggested_node_confidence",
            type_="check",
        )
        batch_op.drop_column("suggested_node_confidence")
    with op.batch_alter_table("sources") as batch_op:
        batch_op.drop_index("ix_sources_recommended_project")
        batch_op.drop_constraint(
            "fk_sources_recommended_project",
            type_="foreignkey",
        )
        batch_op.drop_column("recommended_at")
        batch_op.drop_column("recommended_reason")
        batch_op.drop_column("recommended_confidence")
        batch_op.drop_column("recommended_project_id")
