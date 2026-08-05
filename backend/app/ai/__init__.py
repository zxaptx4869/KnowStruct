"""AI Provider 工厂：按 Workspace 配置解析，环境变量回退。"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProvider, AIProviderError, AIProviderNotConfiguredError
from app.ai.deepseek import DeepSeekProvider
from app.ai.demo import DemoProvider
from app.ai.doubao import DOUBAO_DEFAULT_BASE_URL, DoubaoProvider
from app.config import get_settings
from app.services.ai_config import get_workspace_ai_config
from app.services.secrets import SecretDecryptionError, decrypt_secret

__all__ = [
    "AIProvider",
    "AIProviderError",
    "AIProviderNotConfiguredError",
    "DeepSeekProvider",
    "DemoProvider",
    "DoubaoProvider",
    "get_ai_provider",
]


async def get_ai_provider(
    db: AsyncSession,
    workspace_id: str,
) -> AIProvider:
    """按 Workspace 配置返回 AI Provider；用户配置优先，环境变量回退。"""
    settings = get_settings()
    config = await get_workspace_ai_config(db, workspace_id)
    if config is not None:
        try:
            api_key = decrypt_secret(config.api_key_encrypted)
        except SecretDecryptionError as exc:
            raise AIProviderNotConfiguredError(
                "AI 服务未配置：API Key 无法解密，请重新配置"
            ) from exc
        if config.provider == "deepseek":
            return DeepSeekProvider(
                api_key=api_key,
                base_url=config.base_url or settings.DEEPSEEK_BASE_URL,
                model=config.model or settings.DEEPSEEK_MODEL,
            )
        if config.provider == "doubao":
            return DoubaoProvider(
                api_key=api_key,
                base_url=(
                    config.base_url
                    or settings.DOUBAO_BASE_URL
                    or DOUBAO_DEFAULT_BASE_URL
                ),
                model=config.model or settings.DOUBAO_MODEL,
            )

    provider_name = settings.AI_PROVIDER
    if provider_name == "deepseek":
        if not settings.DEEPSEEK_API_KEY:
            raise AIProviderNotConfiguredError(
                "AI 服务未配置：缺少 DEEPSEEK_API_KEY"
            )
        return DeepSeekProvider(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_BASE_URL,
            model=settings.DEEPSEEK_MODEL,
        )
    if provider_name == "doubao":
        if not settings.DOUBAO_API_KEY:
            raise AIProviderNotConfiguredError(
                "AI 服务未配置：缺少 DOUBAO_API_KEY"
            )
        return DoubaoProvider(
            api_key=settings.DOUBAO_API_KEY,
            base_url=settings.DOUBAO_BASE_URL or DOUBAO_DEFAULT_BASE_URL,
            model=settings.DOUBAO_MODEL,
        )
    if provider_name == "demo":
        return DemoProvider()
    raise AIProviderNotConfiguredError(f"未知的 AI Provider：{provider_name}")
