"""Move image attachments from sources columns into a source_attachments table."""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision: str = "0005_source_attachments"
down_revision: str | None = "0004_upload_image_ocr_ai_config"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _backfill_attachments_upgrade(connection) -> None:
    rows = connection.execute(
        sa.text(
            "SELECT id, workspace_id, attachment_object_key, attachment_filename, "
            "attachment_content_type, attachment_size FROM sources "
            "WHERE attachment_object_key IS NOT NULL"
        )
    ).fetchall()
    now = datetime.now(UTC).replace(tzinfo=None)
    for row in rows:
        connection.execute(
            sa.text(
                "INSERT INTO source_attachments "
                "(id, source_id, workspace_id, object_key, filename, content_type, "
                "size, sort_order, created_at, updated_at) "
                "VALUES (:id, :source_id, :workspace_id, :object_key, :filename, "
                ":content_type, :size, 0, :now, :now)"
            ),
            {
                "id": str(uuid.uuid4()),
                "source_id": row.id,
                "workspace_id": row.workspace_id,
                "object_key": row.attachment_object_key,
                "filename": row.attachment_filename,
                "content_type": row.attachment_content_type,
                "size": row.attachment_size,
                "now": now,
            },
        )


def _backfill_sources_downgrade(connection) -> None:
    connection.execute(
        sa.text(
            "UPDATE sources SET "
            "attachment_object_key = (SELECT a.object_key FROM source_attachments a "
            "  WHERE a.source_id = sources.id ORDER BY a.sort_order LIMIT 1), "
            "attachment_filename = (SELECT a.filename FROM source_attachments a "
            "  WHERE a.source_id = sources.id ORDER BY a.sort_order LIMIT 1), "
            "attachment_content_type = (SELECT a.content_type FROM source_attachments a "
            "  WHERE a.source_id = sources.id ORDER BY a.sort_order LIMIT 1), "
            "attachment_size = (SELECT a.size FROM source_attachments a "
            "  WHERE a.source_id = sources.id ORDER BY a.sort_order LIMIT 1) "
            "WHERE EXISTS (SELECT 1 FROM source_attachments a "
            "  WHERE a.source_id = sources.id)"
        )
    )


def upgrade() -> None:
    op.create_table(
        "source_attachments",
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["sources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_source_attachments_source_order",
        "source_attachments",
        ["source_id", "sort_order"],
    )
    op.create_index(
        "ix_source_attachments_workspace",
        "source_attachments",
        ["workspace_id"],
    )

    _backfill_attachments_upgrade(op.get_bind())

    with op.batch_alter_table("sources") as batch_op:
        batch_op.drop_column("attachment_object_key")
        batch_op.drop_column("attachment_filename")
        batch_op.drop_column("attachment_content_type")
        batch_op.drop_column("attachment_size")


def downgrade() -> None:
    with op.batch_alter_table("sources") as batch_op:
        batch_op.add_column(sa.Column("attachment_object_key", sa.String(512), nullable=True))
        batch_op.add_column(sa.Column("attachment_filename", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("attachment_content_type", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("attachment_size", sa.Integer(), nullable=True))

    _backfill_sources_downgrade(op.get_bind())

    op.drop_index("ix_source_attachments_workspace", table_name="source_attachments")
    op.drop_index("ix_source_attachments_source_order", table_name="source_attachments")
    op.drop_table("source_attachments")
