"""Add generated summary fields to projects."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0018_project_summary"
down_revision: str | None = "0017_archive_suggestion_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.add_column(
            sa.Column("summary", sa.String(length=2000), nullable=True)
        )
        batch_op.add_column(
            sa.Column("summary_signature", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column("summary_updated_at", sa.DateTime(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_column("summary_updated_at")
        batch_op.drop_column("summary_signature")
        batch_op.drop_column("summary")
