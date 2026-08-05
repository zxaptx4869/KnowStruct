"""Formal knowledge entry models with source traceability."""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.capture import Extraction, Source


class EntryType(StrEnum):
    EXPERIENCE = "experience"
    PARAMETER = "parameter"
    PITFALL = "pitfall"
    PRODUCT = "product"
    PRICE = "price"
    DECISION = "decision"
    TODO = "todo"
    QUESTION = "question"


class EntryStatus(StrEnum):
    ARCHIVED = "archived"
    CONFLICT = "conflict"


_ENTRY_TYPES_SQL = ", ".join(f"'{value}'" for value in EntryType)


class Entry(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "entries"
    __table_args__ = (
        CheckConstraint(
            f"entry_type IN ({_ENTRY_TYPES_SQL})",
            name="ck_entries_entry_type",
        ),
        CheckConstraint(
            "status IN ('archived', 'conflict')",
            name="ck_entries_status",
        ),
        Index("ix_entries_workspace_created", "workspace_id", "created_at"),
        Index("ix_entries_project", "project_id"),
        Index("ix_entries_node", "node_id"),
    )

    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    node_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=True,
    )
    extraction_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("extractions.id", ondelete="CASCADE"),
        nullable=True,
        unique=True,
    )
    entry_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=EntryStatus.ARCHIVED.value,
        server_default=EntryStatus.ARCHIVED.value,
    )

    extraction: Mapped[Extraction | None] = relationship(back_populates="entry")
    sources: Mapped[list[Source]] = relationship(
        secondary="entry_sources",
        back_populates="entries",
    )


class EntrySource(Base):
    __tablename__ = "entry_sources"
    __table_args__ = (
        Index("ix_entry_sources_source", "source_id"),
    )

    entry_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("entries.id", ondelete="CASCADE"),
        primary_key=True,
    )
    source_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sources.id", ondelete="CASCADE"),
        primary_key=True,
    )
