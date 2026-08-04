"""Workspace projects and adjacency-list knowledge directory nodes."""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.auth import Workspace


class ProjectStatus(StrEnum):
    PLANNING = "planning"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"


class Project(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "status IN ('planning', 'active', 'paused', 'completed')",
            name="ck_projects_status",
        ),
        Index("ix_projects_workspace_updated", "workspace_id", "updated_at"),
    )

    workspace_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    goal: Mapped[str | None] = mapped_column(String(500), nullable=True)
    background: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=ProjectStatus.PLANNING.value,
        server_default=ProjectStatus.PLANNING.value,
    )

    workspace: Mapped[Workspace] = relationship(back_populates="projects")
    nodes: Mapped[list[Node]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Node(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "nodes"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "sibling_scope",
            "normalized_name",
            name="uq_nodes_sibling_name",
        ),
        CheckConstraint("sort_order >= 0", name="ck_nodes_sort_order_nonnegative"),
        Index("ix_nodes_project_parent_order", "project_id", "parent_id", "sort_order"),
    )

    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("nodes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    sibling_scope: Mapped[str] = mapped_column(String(45), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    project: Mapped[Project] = relationship(back_populates="nodes")
    parent: Mapped[Node | None] = relationship(
        back_populates="children",
        remote_side="Node.id",
    )
    children: Mapped[list[Node]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        passive_deletes=True,
        single_parent=True,
    )
