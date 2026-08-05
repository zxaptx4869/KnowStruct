"""Workspace 级 AI Provider 配置 API。"""

from fastapi import APIRouter, status

from app.api.deps import Auth, DbSession
from app.schemas.ai_config import AiConfigResponse, AiConfigUpdate
from app.services.ai_config import (
    delete_ai_config,
    get_workspace_ai_config,
    upsert_ai_config,
)
from app.services.secrets import SecretDecryptionError, decrypt_secret, mask_secret

router = APIRouter(prefix="/api/ai-config", tags=["ai-config"])


def _masked(config) -> str:
    if config is None:
        return ""
    try:
        return mask_secret(decrypt_secret(config.api_key_encrypted))
    except SecretDecryptionError:
        return "***"


@router.get("", response_model=AiConfigResponse)
async def ai_config_get(
    auth: Auth,
    db: DbSession,
) -> AiConfigResponse:
    config = await get_workspace_ai_config(db, auth.workspace.id)
    return AiConfigResponse(
        provider=config.provider if config else "",
        base_url=config.base_url if config else None,
        model=config.model if config else None,
        api_key_masked=_masked(config),
    )


@router.put("", response_model=AiConfigResponse)
async def ai_config_put(
    payload: AiConfigUpdate,
    auth: Auth,
    db: DbSession,
) -> AiConfigResponse:
    config = await upsert_ai_config(
        db,
        auth.workspace.id,
        provider=payload.provider,
        api_key=payload.api_key,
        base_url=payload.base_url,
        model=payload.model,
    )
    await db.commit()
    return AiConfigResponse(
        provider=config.provider,
        base_url=config.base_url,
        model=config.model,
        api_key_masked=_masked(config),
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def ai_config_delete(
    auth: Auth,
    db: DbSession,
) -> None:
    await delete_ai_config(db, auth.workspace.id)
    await db.commit()
