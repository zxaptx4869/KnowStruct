"""AI 起草目录候选模型：草稿、草稿节点与会话消息，确认前不触碰正式 Node。"""

from datetime import UTC, datetime

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
    conversation_rounds: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
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
    messages: Mapped[list["DirectoryDraftMessage"]] = relationship(
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


class DirectoryDraftMessage(UUIDMixin, Base):
    """草稿会话消息：user / assistant / system，确认或放弃后保留可追溯。"""

    __tablename__ = "directory_draft_messages"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'assistant', 'system')",
            name="ck_directory_draft_messages_role",
        ),
        Index(
            "ix_directory_draft_messages_draft_created",
            "draft_id",
            "created_at",
        ),
    )

    draft_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("directory_drafts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC).replace(tzinfo=None),
    )

    draft: Mapped[DirectoryDraft] = relationship(back_populates="messages")
