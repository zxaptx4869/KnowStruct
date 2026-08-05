"""Capture inbox, processing task, and extraction models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.entries import EntryType

if TYPE_CHECKING:
    from app.models.entries import Entry
    from app.models.projects import Project


class SourceType(StrEnum):
    TEXT = "text"
    LINK = "link"
    IMAGE = "image"


class SourceContentStatus(StrEnum):
    SAVING = "saving"
    SAVED = "saved"
    UNAVAILABLE = "unavailable"
    PENDING_DELETE = "pending_delete"


class TaskStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class TaskStage(StrEnum):
    OCR = "ocr"
    AI_EXTRACTION = "ai_extraction"


class ExtractionStatus(StrEnum):
    PENDING_CONFIRM = "pending_confirm"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


_ENTRY_TYPES_SQL = ", ".join(f"'{value}'" for value in EntryType)


class Source(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sources"
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('text', 'link', 'image')",
            name="ck_sources_type",
        ),
        CheckConstraint(
            "content_status IN ('saving', 'saved', 'unavailable', 'pending_delete')",
            name="ck_sources_content_status",
        ),
        Index("ix_sources_workspace_created", "workspace_id", "created_at"),
        Index("ix_sources_project", "project_id"),
    )

    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
    )
    source_type: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    link_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    content_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=SourceContentStatus.SAVED.value,
        server_default=SourceContentStatus.SAVED.value,
    )

    project: Mapped[Project | None] = relationship(back_populates="sources")
    task: Mapped[ProcessingTask | None] = relationship(
        back_populates="source",
        uselist=False,
        cascade="all, delete-orphan",
    )
    extractions: Mapped[list[Extraction]] = relationship(
        back_populates="source",
        cascade="all, delete-orphan",
    )
    attachments: Mapped[list[SourceAttachment]] = relationship(
        back_populates="source",
        cascade="all, delete-orphan",
        order_by="SourceAttachment.sort_order",
    )
    entries: Mapped[list[Entry]] = relationship(
        secondary="entry_sources",
        back_populates="sources",
    )


class SourceAttachment(UUIDMixin, TimestampMixin, Base):
    """图片 Source 的附件（一条 Source 最多 3 张）。"""

    __tablename__ = "source_attachments"
    __table_args__ = (
        Index(
            "ix_source_attachments_source_order",
            "source_id",
            "sort_order",
        ),
        Index("ix_source_attachments_workspace", "workspace_id"),
    )

    source_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sources.id", ondelete="CASCADE"),
        nullable=False,
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    object_key: Mapped[str] = mapped_column(String(512), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    source: Mapped[Source] = relationship(back_populates="attachments")


class ProcessingTask(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "processing_tasks"
    __table_args__ = (
        UniqueConstraint("source_id", name="uq_processing_tasks_source"),
        CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed')",
            name="ck_processing_tasks_status",
        ),
        CheckConstraint(
            "stage IN ('ocr', 'ai_extraction')",
            name="ck_processing_tasks_stage",
        ),
        CheckConstraint(
            "attempt_count >= 1",
            name="ck_processing_tasks_attempts",
        ),
        Index("ix_processing_tasks_status_claimed", "status", "claimed_at"),
    )

    source_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sources.id", ondelete="CASCADE"),
        nullable=False,
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    stage: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=TaskStage.AI_EXTRACTION.value,
        server_default=TaskStage.AI_EXTRACTION.value,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=TaskStatus.PENDING.value,
        server_default=TaskStatus.PENDING.value,
    )
    attempt_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    source: Mapped[Source] = relationship(back_populates="task")


class Extraction(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "extractions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_confirm', 'accepted', 'rejected')",
            name="ck_extractions_status",
        ),
        CheckConstraint(
            f"entry_type IN ({_ENTRY_TYPES_SQL})",
            name="ck_extractions_entry_type",
        ),
        CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name="ck_extractions_confidence",
        ),
        Index("ix_extractions_source", "source_id"),
        Index("ix_extractions_workspace_status", "workspace_id", "status"),
    )

    source_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sources.id", ondelete="CASCADE"),
        nullable=False,
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=ExtractionStatus.PENDING_CONFIRM.value,
        server_default=ExtractionStatus.PENDING_CONFIRM.value,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    entry_type: Mapped[str] = mapped_column(String(30), nullable=False)
    suggested_node_path: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )
    applicable_conditions: Mapped[list[str] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    key_params: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    risk_points: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    source: Mapped[Source] = relationship(back_populates="extractions")
    entry: Mapped[Entry | None] = relationship(back_populates="extraction")
