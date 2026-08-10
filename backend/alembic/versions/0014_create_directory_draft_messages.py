"""Create directory draft conversation messages."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014_directory_draft_messages"
down_revision: str | None = "0013_create_directory_drafts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "directory_draft_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "draft_id",
            sa.String(36),
            sa.ForeignKey("directory_drafts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "role IN ('user', 'assistant', 'system')",
            name="ck_directory_draft_messages_role",
        ),
    )
    op.create_index(
        "ix_directory_draft_messages_draft_created",
        "directory_draft_messages",
        ["draft_id", "created_at"],
    )
    op.create_index(
        "ix_directory_draft_messages_draft_id",
        "directory_draft_messages",
        ["draft_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_directory_draft_messages_draft_id",
        table_name="directory_draft_messages",
    )
    op.drop_index(
        "ix_directory_draft_messages_draft_created",
        table_name="directory_draft_messages",
    )
    op.drop_table("directory_draft_messages")
