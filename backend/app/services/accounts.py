"""Operator-managed account provisioning."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Workspace
from app.services.auth import hash_password, normalize_account, revoke_all_user_sessions


class AccountAlreadyExistsError(ValueError):
    pass


class AccountNotFoundError(ValueError):
    pass


async def create_account(db: AsyncSession, account: str, password: str) -> User:
    login_name = normalize_account(account)
    existing = await db.scalar(select(User.id).where(User.login_name == login_name))
    if existing is not None:
        raise AccountAlreadyExistsError("Account already exists")

    user = User(login_name=login_name, password_hash=hash_password(password))
    user.workspace = Workspace(name="我的工作区")
    db.add(user)
    await db.flush()
    return user


async def reset_account_password(db: AsyncSession, account: str, password: str) -> User:
    login_name = normalize_account(account)
    user = await db.scalar(select(User).where(User.login_name == login_name))
    if user is None:
        raise AccountNotFoundError("Account does not exist")

    user.password_hash = hash_password(password)
    await revoke_all_user_sessions(db, user.id)
    await db.flush()
    return user
