"""Authentication and personal workspace models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.projects import Project


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    login_name: Mapped[str] = mapped_column(String(191), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    workspace: Mapped[Workspace] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
        uselist=False,
    )
    auth_sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Workspace(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "workspaces"

    owner_user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(191), nullable=False, default="我的工作区")

    owner: Mapped[User] = relationship(back_populates="workspace")
    projects: Mapped[list[Project]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class AuthSession(UUIDMixin, Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        Index("ix_auth_sessions_expires_at", "expires_at"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    user: Mapped[User] = relationship(back_populates="auth_sessions")
