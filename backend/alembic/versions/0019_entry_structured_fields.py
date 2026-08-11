"""Add structured fields (key_params / risk_points) to entries."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019_entry_structured_fields"
down_revision: str | None = "0018_project_summary"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("entries") as batch_op:
        batch_op.add_column(sa.Column("key_params", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("risk_points", sa.JSON(), nullable=True))
    # 历史记录从关联 Extraction 回填避坑要点；key_params 历史为空。
    op.execute(
        """
        UPDATE entries
        SET risk_points = (
            SELECT x.risk_points
            FROM extractions x
            WHERE x.id = entries.extraction_id
        )
        WHERE extraction_id IS NOT NULL
          AND EXISTS (
              SELECT 1
              FROM extractions x
              WHERE x.id = entries.extraction_id
                AND x.risk_points IS NOT NULL
          )
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("entries") as batch_op:
        batch_op.drop_column("risk_points")
        batch_op.drop_column("key_params")
