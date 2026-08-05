import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AiProviderConfig
from app.services.accounts import create_account
from tests.test_inbox_api import login_owner


@pytest.mark.asyncio
async def test_ai_config_save_masked_get_update_delete(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)

    missing = await client.get("/api/ai-config")
    assert missing.status_code == 200
    assert missing.json() == {
        "provider": "",
        "base_url": None,
        "model": None,
        "api_key_masked": "",
    }

    saved = await client.put(
        "/api/ai-config",
        json={
            "provider": "deepseek",
            "api_key": "sk-test-12345678",
            "base_url": "https://api.deepseek.com",
            "model": "deepseek-chat",
        },
    )
    assert saved.status_code == 200
    assert saved.json()["provider"] == "deepseek"
    assert saved.json()["api_key_masked"] == "sk-***5678"

    fetched = (await client.get("/api/ai-config")).json()
    assert fetched["api_key_masked"] == "sk-***5678"
    assert "sk-test-12345678" not in str(fetched)

    updated = await client.put(
        "/api/ai-config",
        json={
            "provider": "deepseek",
            "base_url": "https://api.deepseek.com/v2",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["base_url"] == "https://api.deepseek.com/v2"
    assert updated.json()["api_key_masked"] == "sk-***5678"

    deleted = await client.delete("/api/ai-config")
    assert deleted.status_code == 204
    assert (await client.get("/api/ai-config")).json()["provider"] == ""


@pytest.mark.asyncio
async def test_ai_config_first_save_requires_key(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    response = await client.put(
        "/api/ai-config",
        json={"provider": "doubao", "base_url": "https://ark.example.com"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "api_key_required"


@pytest.mark.asyncio
async def test_ai_config_is_workspace_scoped(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    async with db.begin():
        other = await create_account(db, "other", "another valid password")
    other_workspace_id = other.workspace.id
    await client.post(
        "/api/auth/login",
        json={"account": "other", "password": "another valid password"},
    )
    saved = await client.put(
        "/api/ai-config",
        json={"provider": "doubao", "api_key": "sk-other-12345678"},
    )
    assert saved.status_code == 200
    assert saved.json()["api_key_masked"] == "sk-***5678"

    await client.post(
        "/api/auth/login",
        json={"account": "owner", "password": "correct horse battery"},
    )
    fetched = (await client.get("/api/ai-config")).json()
    assert fetched["provider"] == ""
    assert fetched["api_key_masked"] == ""

    # 再次登录 other，确认配置仍隔离存在
    await client.post(
        "/api/auth/login",
        json={"account": "other", "password": "another valid password"},
    )
    fetched = (await client.get("/api/ai-config")).json()
    assert fetched["provider"] == "doubao"
    assert other_workspace_id != ""


@pytest.mark.asyncio
async def test_switching_provider_requires_new_key(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    await client.put(
        "/api/ai-config",
        json={"provider": "deepseek", "api_key": "sk-test-12345678"},
    )

    switched = await client.put(
        "/api/ai-config",
        json={"provider": "doubao"},
    )
    assert switched.status_code == 409
    assert switched.json()["detail"]["code"] == "api_key_required"

    with_key = await client.put(
        "/api/ai-config",
        json={"provider": "doubao", "api_key": "sk-doubao-12345678"},
    )
    assert with_key.status_code == 200
    assert with_key.json()["provider"] == "doubao"
    assert with_key.json()["api_key_masked"] == "sk-***5678"


@pytest.mark.asyncio
async def test_corrupted_config_prompts_reconfigure(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    await client.put(
        "/api/ai-config",
        json={"provider": "deepseek", "api_key": "sk-test-12345678"},
    )
    config = await db.scalar(select(AiProviderConfig))
    assert config is not None
    config.api_key_encrypted = "not-a-valid-fernet-token"
    await db.commit()

    fetched = (await client.get("/api/ai-config")).json()
    assert fetched["provider"] == "deepseek"
    assert fetched["api_key_masked"] == "配置损坏，请重新配置"


@pytest.mark.asyncio
async def test_ai_config_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/ai-config")).status_code == 401
    assert (await client.put("/api/ai-config", json={})).status_code == 401
    assert (await client.delete("/api/ai-config")).status_code == 401
