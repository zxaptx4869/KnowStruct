"""Add dedupe fingerprint columns to sources and source_attachments."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012_source_fingerprints"
down_revision: str | None = "0011_review_merge_ignored"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("sources") as batch_op:
        batch_op.add_column(
            sa.Column("content_hash", sa.String(64), nullable=True)
        )
        batch_op.add_column(
            sa.Column("link_hash", sa.String(64), nullable=True)
        )
        batch_op.add_column(
            sa.Column("duplicate_of_id", sa.String(36), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_sources_duplicate_of_id",
            "sources",
            ["duplicate_of_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_sources_workspace_content_hash",
            ["workspace_id", "content_hash"],
        )
        batch_op.create_index(
            "ix_sources_workspace_link_hash",
            ["workspace_id", "link_hash"],
        )
    with op.batch_alter_table("source_attachments") as batch_op:
        batch_op.add_column(
            sa.Column("file_hash", sa.String(64), nullable=True)
        )
        batch_op.create_index(
            "ix_source_attachments_workspace_file_hash",
            ["workspace_id", "file_hash"],
        )


def downgrade() -> None:
    with op.batch_alter_table("source_attachments") as batch_op:
        batch_op.drop_index("ix_source_attachments_workspace_file_hash")
        batch_op.drop_column("file_hash")
    with op.batch_alter_table("sources") as batch_op:
        batch_op.drop_constraint(
            "fk_sources_duplicate_of_id",
            type_="foreignkey",
        )
        batch_op.drop_index("ix_sources_workspace_link_hash")
        batch_op.drop_index("ix_sources_workspace_content_hash")
        batch_op.drop_column("duplicate_of_id")
        batch_op.drop_column("link_hash")
        batch_op.drop_column("content_hash")
