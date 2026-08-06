"""Add applicable_conditions to entries and backfill from extractions."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_entries_conditions"
down_revision: str | None = "0005_source_attachments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("entries") as batch_op:
        batch_op.add_column(
            sa.Column("applicable_conditions", sa.JSON(), nullable=True)
        )
    op.execute(
        """
        UPDATE entries
        SET applicable_conditions = (
            SELECT extractions.applicable_conditions
            FROM extractions
            WHERE extractions.id = entries.extraction_id
        )
        WHERE extraction_id IS NOT NULL
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("entries") as batch_op:
        batch_op.drop_column("applicable_conditions")
