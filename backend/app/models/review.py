"""Review finding resolution records."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class FindingType(StrEnum):
    MISSING_SOURCE = "missing_source"
    MISSING_CONDITIONS = "missing_conditions"
    LONG_PENDING = "long_pending"
    DUPLICATE = "duplicate"
    CONFLICT = "conflict"


class FindingTargetType(StrEnum):
    ENTRY = "entry"
    SOURCE = "source"
    AI_FINDING = "ai_finding"


class ResolutionType(StrEnum):
    RESOLVED = "resolved"
    IGNORED = "ignored"


class ScanScopeType(StrEnum):
    WORKSPACE = "workspace"
    PROJECT = "project"
    NODE = "node"


class ScanStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class AiReviewType(StrEnum):
    DUPLICATE = "duplicate"
    CONFLICT = "conflict"


class AiFindingStatus(StrEnum):
    CANDIDATE = "candidate"
    OPEN = "open"
    REJECTED = "rejected"


class ReviewResolution(UUIDMixin, TimestampMixin, Base):
    """用户对某条 Review 问题的处理记录（已解决 / 忽略，可附备注）。"""

    __tablename__ = "review_resolutions"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "finding_type",
            "target_type",
            "target_id",
            name="uq_review_resolutions_finding",
        ),
        CheckConstraint(
            "finding_type IN ('missing_source', 'missing_conditions', 'long_pending', 'duplicate', 'conflict')",
            name="ck_review_resolutions_finding_type",
        ),
        CheckConstraint(
            "target_type IN ('entry', 'source', 'ai_finding')",
            name="ck_review_resolutions_target_type",
        ),
        CheckConstraint(
            "resolution IN ('resolved', 'ignored')",
            name="ck_review_resolutions_resolution",
        ),
        Index("ix_review_resolutions_workspace", "workspace_id"),
    )

    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    finding_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_type: Mapped[str] = mapped_column(String(10), nullable=False)
    target_id: Mapped[str] = mapped_column(String(36), nullable=False)
    resolution: Mapped[str] = mapped_column(String(10), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class ReviewScan(UUIDMixin, TimestampMixin, Base):
    """AI 审查扫描任务（手动触发，进程内 worker 执行）。"""

    __tablename__ = "review_scans"
    __table_args__ = (
        CheckConstraint(
            "scope_type IN ('workspace', 'project', 'node')",
            name="ck_review_scans_scope_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed')",
            name="ck_review_scans_status",
        ),
        Index("ix_review_scans_workspace_status", "workspace_id", "status"),
    )

    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=ScanStatus.PENDING.value,
        server_default=ScanStatus.PENDING.value,
    )
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    truncated: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
    )
    findings_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    resurfaced_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )


class ReviewAiFinding(UUIDMixin, TimestampMixin, Base):
    """AI 审查产出的候选/已确认发现（重复或冲突）。"""

    __tablename__ = "review_ai_findings"
    __table_args__ = (
        CheckConstraint(
            "review_type IN ('duplicate', 'conflict')",
            name="ck_review_ai_findings_type",
        ),
        CheckConstraint(
            "status IN ('candidate', 'open', 'rejected')",
            name="ck_review_ai_findings_status",
        ),
        CheckConstraint(
            "severity IN ('info', 'warning', 'error')",
            name="ck_review_ai_findings_severity",
        ),
        UniqueConstraint(
            "workspace_id",
            "review_type",
            "entry_a_id",
            "entry_b_id",
            name="uq_review_ai_findings_pair",
        ),
        Index(
            "ix_review_ai_findings_workspace_status",
            "workspace_id",
            "status",
        ),
    )

    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    scan_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("review_scans.id", ondelete="CASCADE"),
        nullable=False,
    )
    review_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entry_a_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("entries.id", ondelete="CASCADE"),
        nullable=False,
    )
    entry_b_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("entries.id", ondelete="CASCADE"),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="info",
        server_default="info",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=AiFindingStatus.CANDIDATE.value,
        server_default=AiFindingStatus.CANDIDATE.value,
    )
