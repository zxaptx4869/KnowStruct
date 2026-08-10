"""Add per-draft conversation round counter."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import mysql

from alembic import op

revision: str = "0015_draft_conversation_rounds"
down_revision: str | None = "0014_directory_draft_messages"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "directory_drafts",
        sa.Column(
            "conversation_rounds",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    if op.get_bind().dialect.name == "mysql":
        op.alter_column(
            "directory_draft_messages",
            "created_at",
            existing_type=sa.DateTime(),
            type_=mysql.DATETIME(fsp=6),
            existing_nullable=False,
            nullable=False,
            existing_server_default=sa.text("CURRENT_TIMESTAMP"),
            server_default=sa.text("CURRENT_TIMESTAMP(6)"),
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "mysql":
        op.alter_column(
            "directory_draft_messages",
            "created_at",
            existing_type=mysql.DATETIME(fsp=6),
            type_=sa.DateTime(),
            existing_nullable=False,
            nullable=False,
            existing_server_default=sa.text("CURRENT_TIMESTAMP(6)"),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        )
    op.drop_column("directory_drafts", "conversation_rounds")
