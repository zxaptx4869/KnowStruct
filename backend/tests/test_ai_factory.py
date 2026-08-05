import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import get_ai_provider
from app.ai.base import AIProviderNotConfiguredError
from app.ai.deepseek import DeepSeekProvider
from app.ai.doubao import DoubaoProvider
from app.models import AiProviderConfig
from app.services.accounts import create_account
from app.services.secrets import encrypt_secret, mask_secret


@pytest.mark.asyncio
async def test_factory_uses_workspace_deepseek_config(
    db: AsyncSession,
) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        db.add(
            AiProviderConfig(
                workspace_id=user.workspace.id,
                provider="deepseek",
                api_key_encrypted=encrypt_secret("sk-user-deepseek-123456"),
                base_url="https://api.deepseek.com",
                model="deepseek-chat",
            )
        )
        await db.flush()

    provider = await get_ai_provider(db, user.workspace.id)
    assert isinstance(provider, DeepSeekProvider)
    assert provider.model == "deepseek-chat"


@pytest.mark.asyncio
async def test_factory_uses_workspace_doubao_config(
    db: AsyncSession,
) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        db.add(
            AiProviderConfig(
                workspace_id=user.workspace.id,
                provider="doubao",
                api_key_encrypted=encrypt_secret("sk-user-doubao-123456"),
                base_url="https://ark.cn-beijing.volces.com/api/v3",
                model="doubao-seed-2-0-lite-260428",
            )
        )
        await db.flush()

    provider = await get_ai_provider(db, user.workspace.id)
    assert isinstance(provider, DoubaoProvider)
    assert provider.model == "doubao-seed-2-0-lite-260428"


@pytest.mark.asyncio
async def test_factory_fails_readably_without_config(
    db: AsyncSession,
) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        await db.flush()

    with pytest.raises(AIProviderNotConfiguredError) as excinfo:
        await get_ai_provider(db, user.workspace.id)
    assert "AI 服务未配置" in str(excinfo.value)
    assert "sk-" not in str(excinfo.value)


@pytest.mark.asyncio
async def test_factory_fails_when_stored_key_is_corrupted(
    db: AsyncSession,
) -> None:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        db.add(
            AiProviderConfig(
                workspace_id=user.workspace.id,
                provider="deepseek",
                api_key_encrypted="not-a-valid-fernet-token",
            )
        )
        await db.flush()

    with pytest.raises(AIProviderNotConfiguredError) as excinfo:
        await get_ai_provider(db, user.workspace.id)
    assert "无法解密" in str(excinfo.value)


def test_mask_secret_rules() -> None:
    assert mask_secret("sk-test-12345678") == "sk-***5678"
    assert mask_secret("short") == "***"
    assert mask_secret("") == ""
