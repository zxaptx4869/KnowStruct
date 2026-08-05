"""AI Provider 配置请求 / 响应 schema。"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

ProviderValue = Literal["deepseek", "doubao"]


def _strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class AiConfigUpdate(BaseModel):
    provider: ProviderValue
    api_key: str | None = Field(default=None, max_length=500)
    base_url: str | None = Field(default=None, max_length=500)
    model: str | None = Field(default=None, max_length=200)

    _strip_optional = field_validator("api_key", "base_url", "model", mode="before")(
        _strip_optional
    )

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, value: str | None) -> str | None:
        if value is not None and len(value) < 4:
            raise ValueError("API Key 过短")
        return value


class AiConfigResponse(BaseModel):
    provider: str
    base_url: str | None = None
    model: str | None = None
    api_key_masked: str
