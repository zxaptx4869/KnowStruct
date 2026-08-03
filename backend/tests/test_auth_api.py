from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.accounts import create_account, reset_account_password
from app.services.auth import create_auth_session


async def provision_user(db: AsyncSession) -> None:
    async with db.begin():
        await create_account(db, "owner", "correct horse battery")


@pytest.mark.asyncio
async def test_login_restore_and_logout(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await provision_user(db)

    response = await client.post(
        "/api/auth/login",
        json={"account": "OWNER", "password": "correct horse battery", "remember_me": False},
    )
    assert response.status_code == 200
    assert response.json()["user"]["login_name"] == "owner"
    assert response.json()["workspace"]["name"] == "我的工作区"
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Max-Age" not in cookie

    me_response = await client.get("/api/auth/me")
    assert me_response.status_code == 200

    logout_response = await client.post("/api/auth/logout")
    assert logout_response.status_code == 204
    assert "Max-Age=0" in logout_response.headers["set-cookie"]
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await client.post("/api/auth/logout")).status_code == 204


@pytest.mark.asyncio
async def test_remember_me_uses_persistent_cookie(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await provision_user(db)
    response = await client.post(
        "/api/auth/login",
        json={"account": "owner", "password": "correct horse battery", "remember_me": True},
    )
    assert response.status_code == 200
    assert "Max-Age=2592000" in response.headers["set-cookie"]


@pytest.mark.asyncio
async def test_invalid_credentials_use_same_error(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await provision_user(db)
    missing = await client.post(
        "/api/auth/login",
        json={"account": "missing", "password": "correct horse battery"},
    )
    wrong = await client.post(
        "/api/auth/login",
        json={"account": "owner", "password": "wrong but long enough"},
    )
    assert missing.status_code == wrong.status_code == 401
    assert missing.json() == wrong.json()
    assert missing.json()["detail"]["code"] == "invalid_credentials"


@pytest.mark.asyncio
async def test_login_rate_limit(client: AsyncClient) -> None:
    for _ in range(10):
        response = await client.post(
            "/api/auth/login",
            json={"account": "missing", "password": "wrong but long enough"},
        )
        assert response.status_code == 401
    limited = await client.post(
        "/api/auth/login",
        json={"account": "missing", "password": "wrong but long enough"},
    )
    assert limited.status_code == 429
    assert limited.json()["detail"]["code"] == "rate_limited"


@pytest.mark.asyncio
async def test_untrusted_origin_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/login",
        headers={"Origin": "https://attacker.example"},
        json={"account": "owner", "password": "correct horse battery"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "untrusted_origin"


@pytest.mark.asyncio
async def test_invalid_cookie_is_cleared(client: AsyncClient) -> None:
    client.cookies.set("knowstruct_session", "invalid")
    response = await client.get("/api/auth/me")
    assert response.status_code == 401
    assert "Max-Age=0" in response.headers["set-cookie"]


@pytest.mark.asyncio
async def test_password_reset_revokes_api_session(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await provision_user(db)
    login = await client.post(
        "/api/auth/login",
        json={"account": "owner", "password": "correct horse battery"},
    )
    assert login.status_code == 200

    async with db.begin():
        await reset_account_password(db, "owner", "a completely new password")

    assert (await client.get("/api/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_expired_cookie_cannot_access_me(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        _, token = await create_auth_session(db, user.id, timedelta(seconds=-1))
    client.cookies.set("knowstruct_session", token)
    assert (await client.get("/api/auth/me")).status_code == 401
