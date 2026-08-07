"""Merge legacy ignored resolutions into rejected and tighten the enum."""

from collections.abc import Sequence

from alembic import op

revision: str = "0011_review_merge_ignored"
down_revision: str | None = "0010_review_three_states"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE review_resolutions SET resolution = 'rejected' "
        "WHERE resolution = 'ignored'"
    )
    with op.batch_alter_table("review_resolutions") as batch_op:
        batch_op.drop_constraint(
            "ck_review_resolutions_resolution",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_review_resolutions_resolution",
            "resolution IN ('resolved', 'rejected')",
        )


def downgrade() -> None:
    with op.batch_alter_table("review_resolutions") as batch_op:
        batch_op.drop_constraint(
            "ck_review_resolutions_resolution",
            type_="check",
        )
        batch_op.create_check_constraint(
            "ck_review_resolutions_resolution",
            "resolution IN ('resolved', 'ignored', 'rejected')",
        )
