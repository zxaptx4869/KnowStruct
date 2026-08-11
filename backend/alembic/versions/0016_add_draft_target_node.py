"""Add optional target node to directory drafts."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016_add_draft_target_node"
down_revision: str | None = "0015_draft_conversation_rounds"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("directory_drafts") as batch_op:
        batch_op.add_column(
            sa.Column(
                "target_node_id",
                sa.String(length=36),
                nullable=True,
            )
        )
        batch_op.create_foreign_key(
            "fk_directory_drafts_target_node",
            "nodes",
            ["target_node_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_directory_drafts_target_node",
            ["target_node_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("directory_drafts") as batch_op:
        batch_op.drop_index("ix_directory_drafts_target_node")
        batch_op.drop_constraint(
            "fk_directory_drafts_target_node",
            type_="foreignkey",
        )
        batch_op.drop_column("target_node_id")
