"""Image upload, OCR stage, and per-workspace AI provider config."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_upload_image_ocr_ai_config"
down_revision: str | None = "0003_capture_text_to_entry"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("sources") as batch_op:
        batch_op.drop_constraint("ck_sources_type", type_="check")
        batch_op.create_check_constraint(
            "ck_sources_type",
            "source_type IN ('text', 'link', 'image')",
        )
        batch_op.alter_column("content", existing_type=sa.Text(), nullable=True)
        batch_op.add_column(
            sa.Column("attachment_object_key", sa.String(length=512), nullable=True)
        )
        batch_op.add_column(
            sa.Column("attachment_filename", sa.String(length=255), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "attachment_content_type",
                sa.String(length=100),
                nullable=True,
            )
        )
        batch_op.add_column(sa.Column("attachment_size", sa.Integer(), nullable=True))

    with op.batch_alter_table("processing_tasks") as batch_op:
        batch_op.drop_constraint("ck_processing_tasks_stage", type_="check")
        batch_op.create_check_constraint(
            "ck_processing_tasks_stage",
            "stage IN ('ocr', 'ai_extraction')",
        )

    op.create_table(
        "ai_provider_configs",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("api_key_encrypted", sa.Text(), nullable=False),
        sa.Column("base_url", sa.String(length=500), nullable=True),
        sa.Column("model", sa.String(length=200), nullable=True),
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
        sa.CheckConstraint(
            "provider IN ('deepseek', 'doubao')",
            name="ck_ai_provider_configs_provider",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", name="uq_ai_provider_configs_workspace"),
    )


def downgrade() -> None:
    op.drop_table("ai_provider_configs")

    with op.batch_alter_table("processing_tasks") as batch_op:
        batch_op.drop_constraint("ck_processing_tasks_stage", type_="check")
        batch_op.create_check_constraint(
            "ck_processing_tasks_stage",
            "stage IN ('ai_extraction')",
        )

    op.execute("DELETE FROM sources WHERE source_type = 'image'")
    with op.batch_alter_table("sources") as batch_op:
        batch_op.drop_constraint("ck_sources_type", type_="check")
        batch_op.create_check_constraint(
            "ck_sources_type",
            "source_type IN ('text', 'link')",
        )
        batch_op.drop_column("attachment_size")
        batch_op.drop_column("attachment_content_type")
        batch_op.drop_column("attachment_filename")
        batch_op.drop_column("attachment_object_key")
        batch_op.alter_column("content", existing_type=sa.Text(), nullable=False)
