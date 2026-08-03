from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Workspace
from app.services.accounts import (
    AccountAlreadyExistsError,
    create_account,
    reset_account_password,
)
from app.services.auth import (
    create_auth_session,
    hash_password,
    hash_session_token,
    resolve_auth_session,
    revoke_session,
    verify_password,
)
from app.services.rate_limit import SlidingWindowRateLimiter


def test_password_hashing_and_boundaries() -> None:
    password = "correct horse battery"
    encoded = hash_password(password)

    assert encoded.startswith("$argon2id$")
    assert password not in encoded
    assert verify_password(password, encoded)
    assert not verify_password("incorrect password", encoded)

    with pytest.raises(ValueError):
        hash_password("short")
    with pytest.raises(ValueError):
        hash_password("x" * 129)


@pytest.mark.asyncio
async def test_account_creation_is_unique_and_creates_workspace(db: AsyncSession) -> None:
    async with db.begin():
        user = await create_account(db, "  Owner  ", "correct horse battery")

    assert user.login_name == "owner"
    assert user.workspace.name == "我的工作区"

    with pytest.raises(AccountAlreadyExistsError):
        async with db.begin():
            await create_account(db, "OWNER", "another valid password")

    assert await db.scalar(select(func.count()).select_from(User)) == 1
    assert await db.scalar(select(func.count()).select_from(Workspace)) == 1


@pytest.mark.asyncio
async def test_invalid_password_writes_no_partial_account(db: AsyncSession) -> None:
    with pytest.raises(ValueError):
        async with db.begin():
            await create_account(db, "owner", "short")

    assert await db.scalar(select(func.count()).select_from(User)) == 0
    assert await db.scalar(select(func.count()).select_from(Workspace)) == 0


@pytest.mark.asyncio
async def test_session_stores_only_hash_and_can_be_revoked(db: AsyncSession) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        auth_session, raw_token = await create_auth_session(db, user.id, timedelta(hours=24))

    assert auth_session.token_hash == hash_session_token(raw_token)
    assert raw_token != auth_session.token_hash
    assert await resolve_auth_session(db, raw_token) is not None
    await db.commit()

    async with db.begin():
        assert await revoke_session(db, raw_token)
    assert await resolve_auth_session(db, raw_token) is None


@pytest.mark.asyncio
async def test_expired_session_is_rejected(db: AsyncSession) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        _, raw_token = await create_auth_session(db, user.id, timedelta(seconds=-1))

    assert await resolve_auth_session(db, raw_token) is None


@pytest.mark.asyncio
async def test_password_reset_revokes_every_session(db: AsyncSession) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        _, first_token = await create_auth_session(db, user.id, timedelta(days=30))
        _, second_token = await create_auth_session(db, user.id, timedelta(days=30))

    async with db.begin():
        await reset_account_password(db, "OWNER", "a completely new password")

    assert await resolve_auth_session(db, first_token) is None
    assert await resolve_auth_session(db, second_token) is None
    stored_user = await db.scalar(select(User).where(User.login_name == "owner"))
    assert stored_user is not None
    assert verify_password("a completely new password", stored_user.password_hash)


@pytest.mark.asyncio
async def test_rate_limiter_sliding_window() -> None:
    limiter = SlidingWindowRateLimiter(limit=2, window_seconds=60)
    assert await limiter.check("client", now=100) == (True, 0)
    assert await limiter.check("client", now=101) == (True, 0)
    allowed, retry_after = await limiter.check("client", now=102)
    assert not allowed
    assert retry_after == 58
    assert await limiter.check("client", now=161) == (True, 0)
