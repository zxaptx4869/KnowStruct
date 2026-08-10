"""AI 起草目录候选模型：草稿与草稿节点，确认前不触碰正式 Node。"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.projects import Project


class DraftStatus:
    DRAFTING = "drafting"
    AWAITING_INPUT = "awaiting_input"
    PENDING_CONFIRM = "pending_confirm"
    FAILED = "failed"
    CONFIRMED = "confirmed"
    DISCARDED = "discarded"

    ACTIVE: frozenset[str] = frozenset(
        {DRAFTING, AWAITING_INPUT, PENDING_CONFIRM, FAILED}
    )


class DraftNextAction:
    CLARIFY = "clarify"
    GENERATE = "generate"
    REFINE = "refine"


class DirectoryDraft(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "directory_drafts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('drafting', 'awaiting_input', 'pending_confirm', "
            "'failed', 'confirmed', 'discarded')",
            name="ck_directory_drafts_status",
        ),
        CheckConstraint(
            "next_action IN ('clarify', 'generate', 'refine')",
            name="ck_directory_drafts_next_action",
        ),
        Index(
            "ix_directory_drafts_project_status",
            "project_id",
            "status",
        ),
    )

    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=DraftStatus.DRAFTING,
        server_default=DraftStatus.DRAFTING,
    )
    next_action: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=DraftNextAction.CLARIFY,
        server_default=DraftNextAction.CLARIFY,
    )
    background_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    intent_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    clarify_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    clarify_answers_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    refine_instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project] = relationship()
    nodes: Mapped[list["DirectoryDraftNode"]] = relationship(
        back_populates="draft",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DirectoryDraftNode(UUIDMixin, Base):
    __tablename__ = "directory_draft_nodes"
    __table_args__ = (
        CheckConstraint(
            "sort_order >= 0",
            name="ck_directory_draft_nodes_sort",
        ),
        Index(
            "ix_directory_draft_nodes_draft_parent",
            "draft_id",
            "parent_id",
            "sort_order",
        ),
    )

    draft_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("directory_drafts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("directory_draft_nodes.id", ondelete="CASCADE"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    selected: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="1",
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    draft: Mapped[DirectoryDraft] = relationship(back_populates="nodes")
