"""Review finding resolution records."""

from __future__ import annotations

from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class FindingType(StrEnum):
    MISSING_SOURCE = "missing_source"
    MISSING_CONDITIONS = "missing_conditions"
    LONG_PENDING = "long_pending"


class FindingTargetType(StrEnum):
    ENTRY = "entry"
    SOURCE = "source"


class ResolutionType(StrEnum):
    RESOLVED = "resolved"
    IGNORED = "ignored"


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
            "finding_type IN ('missing_source', 'missing_conditions', 'long_pending')",
            name="ck_review_resolutions_finding_type",
        ),
        CheckConstraint(
            "target_type IN ('entry', 'source')",
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
