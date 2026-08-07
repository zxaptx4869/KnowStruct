"""Three-state review: direct open findings, rejected resolutions, skip counts."""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision: str = "0010_review_three_states"
down_revision: str | None = "0009_review_scan_resurfaced"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("review_scans") as batch_op:
        batch_op.add_column(
            sa.Column(
                "skipped_rejected_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )

    with op.batch_alter_table("review_resolutions") as batch_op:
        batch_op.drop_constraint(
            "ck_review_resolutions_resolution",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_review_resolutions_resolution",
            "resolution IN ('resolved', 'ignored', 'rejected')",
        )

    # 旧 rejected 发现补写处理记录保留拒绝意图，随后全部收敛为 open
    connection = op.get_bind()
    rejected_rows = connection.execute(
        sa.text(
            "SELECT id, workspace_id, review_type FROM review_ai_findings "
            "WHERE status = 'rejected'"
        )
    ).fetchall()
    now = datetime.now(UTC).replace(tzinfo=None)
    for row in rejected_rows:
        connection.execute(
            sa.text(
                "INSERT INTO review_resolutions ("
                "  id, workspace_id, finding_type, target_type, target_id,"
                "  resolution, note, created_at, updated_at"
                ") VALUES ("
                "  :id, :workspace_id, :finding_type, 'ai_finding',"
                "  :target_id, 'rejected', NULL, :now, :now"
                ")"
            ),
            {
                "id": str(uuid.uuid4()),
                "workspace_id": row.workspace_id,
                "finding_type": row.review_type,
                "target_id": row.id,
                "now": now,
            },
        )
    connection.execute(
        sa.text("UPDATE review_ai_findings SET status = 'open'")
    )
    with op.batch_alter_table("review_ai_findings") as batch_op:
        batch_op.drop_constraint(
            "ck_review_ai_findings_status",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_review_ai_findings_status",
            "status IN ('open')",
        )


def downgrade() -> None:
    with op.batch_alter_table("review_ai_findings") as batch_op:
        batch_op.drop_constraint(
            "ck_review_ai_findings_status",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_review_ai_findings_status",
            "status IN ('candidate', 'open', 'rejected')",
        )
    with op.batch_alter_table("review_resolutions") as batch_op:
        batch_op.drop_constraint(
            "ck_review_resolutions_resolution",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_review_resolutions_resolution",
            "resolution IN ('resolved', 'ignored')",
        )
    with op.batch_alter_table("review_scans") as batch_op:
        batch_op.drop_column("skipped_rejected_count")
