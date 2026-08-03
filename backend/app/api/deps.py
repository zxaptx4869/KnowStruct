"""Shared API dependencies."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import NotAuthenticatedError
from app.config import get_settings
from app.database import get_db
from app.models import AuthSession, User, Workspace
from app.services.auth import resolve_auth_session

DbSession = Annotated[AsyncSession, Depends(get_db)]
settings = get_settings()


@dataclass(frozen=True)
class AuthContext:
    user: User
    workspace: Workspace
    session: AuthSession


async def get_auth_context(request: Request, db: DbSession) -> AuthContext:
    auth_session = await resolve_auth_session(
        db,
        request.cookies.get(settings.SESSION_COOKIE_NAME),
    )
    if auth_session is None or auth_session.user.workspace is None:
        raise NotAuthenticatedError
    return AuthContext(
        user=auth_session.user,
        workspace=auth_session.user.workspace,
        session=auth_session,
    )


Auth = Annotated[AuthContext, Depends(get_auth_context)]


async def get_current_user(auth: Auth) -> User:
    return auth.user


async def get_current_workspace(auth: Auth) -> Workspace:
    return auth.workspace
