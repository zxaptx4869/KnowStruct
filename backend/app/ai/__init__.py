"""AI Provider 工厂。"""

from functools import lru_cache

from app.ai.base import AIProvider, AIProviderError, AIProviderNotConfiguredError
from app.ai.deepseek import DeepSeekProvider
from app.ai.demo import DemoProvider
from app.config import get_settings

__all__ = [
    "AIProvider",
    "AIProviderError",
    "AIProviderNotConfiguredError",
    "DeepSeekProvider",
    "DemoProvider",
    "get_ai_provider",
]


@lru_cache
def get_ai_provider() -> AIProvider:
    """按配置返回当前 AI Provider 实例。"""
    settings = get_settings()
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
    if provider_name == "demo":
        return DemoProvider()
    raise AIProviderNotConfiguredError(f"未知的 AI Provider：{provider_name}")
