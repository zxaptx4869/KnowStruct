"""Password and revocable session services."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import AuthSession, User

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128

password_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)
DUMMY_PASSWORD_HASH = password_hasher.hash("knowstruct-dummy-password")


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def normalize_account(account: str) -> str:
    normalized = account.strip().casefold()
    if not normalized:
        raise ValueError("Account is required")
    return normalized


def validate_password(password: str) -> None:
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must be between {MIN_PASSWORD_LENGTH} and {MAX_PASSWORD_LENGTH} characters"
        )


def hash_password(password: str) -> str:
    validate_password(password)
    return password_hasher.hash(password)


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        return password_hasher.verify(encoded_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def create_auth_session(
    db: AsyncSession,
    user_id: str,
    lifetime: timedelta,
    *,
    now: datetime | None = None,
) -> tuple[AuthSession, str]:
    created_at = now or utc_now()
    raw_token = generate_session_token()
    auth_session = AuthSession(
        user_id=user_id,
        token_hash=hash_session_token(raw_token),
        created_at=created_at,
        expires_at=created_at + lifetime,
    )
    db.add(auth_session)
    await db.flush()
    return auth_session, raw_token


async def resolve_auth_session(
    db: AsyncSession,
    raw_token: str | None,
    *,
    now: datetime | None = None,
) -> AuthSession | None:
    if not raw_token:
        return None
    result = await db.execute(
        select(AuthSession)
        .where(AuthSession.token_hash == hash_session_token(raw_token))
        .options(selectinload(AuthSession.user).selectinload(User.workspace))
    )
    auth_session = result.scalar_one_or_none()
    current_time = now or utc_now()
    if (
        auth_session is None
        or auth_session.revoked_at is not None
        or auth_session.expires_at <= current_time
    ):
        return None
    return auth_session


async def revoke_session(
    db: AsyncSession,
    raw_token: str | None,
    *,
    now: datetime | None = None,
) -> bool:
    if not raw_token:
        return False
    result = await db.execute(
        update(AuthSession)
        .where(
            AuthSession.token_hash == hash_session_token(raw_token),
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=now or utc_now())
    )
    return bool(result.rowcount)


async def revoke_all_user_sessions(
    db: AsyncSession,
    user_id: str,
    *,
    now: datetime | None = None,
) -> int:
    result = await db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now or utc_now())
    )
    return int(result.rowcount or 0)
