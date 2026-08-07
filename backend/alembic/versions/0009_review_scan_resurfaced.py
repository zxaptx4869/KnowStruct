"""Add resurfaced_count to review_scans."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_review_scan_resurfaced"
down_revision: str | None = "0008_review_ai_scans"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("review_scans") as batch_op:
        batch_op.add_column(
            sa.Column(
                "resurfaced_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("review_scans") as batch_op:
        batch_op.drop_column("resurfaced_count")
