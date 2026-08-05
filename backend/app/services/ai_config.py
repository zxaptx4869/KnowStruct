"""Workspace 级 AI Provider 配置的读取与维护。"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ConflictError, ResourceNotFoundError
from app.models import AiProviderConfig
from app.services.secrets import encrypt_secret


async def get_workspace_ai_config(
    db: AsyncSession,
    workspace_id: str,
) -> AiProviderConfig | None:
    return await db.scalar(
        select(AiProviderConfig).where(
            AiProviderConfig.workspace_id == workspace_id
        )
    )


def _strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


async def upsert_ai_config(
    db: AsyncSession,
    workspace_id: str,
    *,
    provider: str,
    api_key: str | None,
    base_url: str | None,
    model: str | None,
) -> AiProviderConfig:
    config = await get_workspace_ai_config(db, workspace_id)
    if config is None:
        if not api_key:
            raise ConflictError("api_key_required", "首次配置必须提供 API Key")
        config = AiProviderConfig(
            workspace_id=workspace_id,
            provider=provider,
            api_key_encrypted=encrypt_secret(api_key),
            base_url=_strip_optional(base_url),
            model=_strip_optional(model),
        )
        db.add(config)
    else:
        config.provider = provider
        if api_key:
            config.api_key_encrypted = encrypt_secret(api_key)
        config.base_url = _strip_optional(base_url)
        config.model = _strip_optional(model)
    await db.flush()
    return config


async def delete_ai_config(
    db: AsyncSession,
    workspace_id: str,
) -> None:
    config = await get_workspace_ai_config(db, workspace_id)
    if config is None:
        raise ResourceNotFoundError("ai_config")
    await db.delete(config)
    await db.flush()
