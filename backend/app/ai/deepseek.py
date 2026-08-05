"""DeepSeek AI Provider (OpenAI-compatible SDK)."""

import json

from openai import AsyncOpenAI
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.ai.base import (
    AIProvider,
    AIProviderError,
    ExtractionResult,
    OutlineNode,
    ReviewResult,
)
from app.models.entries import EntryType

_ENTRY_TYPE_KEYS = ", ".join(f'"{value}"' for value in EntryType)

_SYSTEM_PROMPT = (
    "你是知识整理助手。根据用户提供的原始内容，提取 2-4 条可归档的知识候选。"
    '必须只输出一个 JSON 对象，格式为 {"candidates": [{"title": "...", '
    '"content": "...", "entry_type": "...", "applicable_conditions": ["..."], '
    '"risk_points": ["..."], "confidence": 0.9, "suggested_node_path": "..."}]}。'
    f'entry_type 只能取以下值之一：{_ENTRY_TYPE_KEYS}。'
    "confidence 是 0 到 1 的数字。不要输出 JSON 之外的任何内容。"
)


class _CandidateModel(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=20000)
    entry_type: str
    suggested_node_path: str | None = None
    applicable_conditions: list[str] = Field(default_factory=list)
    risk_points: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)

    @field_validator("title", "content")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("suggested_node_path")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("entry_type")
    @classmethod
    def validate_entry_type(cls, value: str) -> str:
        if value not in EntryType.__members__.values():
            raise ValueError(f"不支持的记录类型: {value}")
        return value


class DeepSeekProvider(AIProvider):
    """通过 OpenAI 兼容接口调用 DeepSeek。"""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
    ) -> None:
        self.model = model
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def extract_candidates(
        self,
        content: str,
        content_type: str = "text",
    ) -> list[ExtractionResult]:
        try:
            response = await self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"来源类型：{content_type}\n原始内容：\n{content}",
                    },
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
        except Exception as exc:
            raise AIProviderError(f"AI 服务调用失败：{exc}") from exc

        message = response.choices[0].message.content if response.choices else ""
        try:
            payload = json.loads(message or "")
        except json.JSONDecodeError as exc:
            raise AIProviderError("AI 输出不是有效 JSON，请重试") from exc

        if not isinstance(payload, dict) or not isinstance(payload.get("candidates"), list):
            raise AIProviderError("AI 输出缺少 candidates 数组，请重试")

        candidates: list[ExtractionResult] = []
        for index, item in enumerate(payload["candidates"]):
            try:
                candidate = _CandidateModel.model_validate(item)
            except ValidationError as exc:
                first_error = exc.errors()[0] if exc.errors() else {}
                field_name = ".".join(str(part) for part in first_error.get("loc", ()))
                raise AIProviderError(
                    f"AI 候选校验失败（第 {index + 1} 条，字段 {field_name or '未知'}）"
                ) from exc
            candidates.append(
                ExtractionResult(
                    title=candidate.title,
                    content=candidate.content,
                    entry_type=candidate.entry_type,
                    suggested_node_path=candidate.suggested_node_path,
                    key_params=None,
                    risk_points=candidate.risk_points,
                    applicable_conditions=candidate.applicable_conditions,
                    confidence=candidate.confidence,
                )
            )

        if not candidates:
            raise AIProviderError("未生成有效候选，请重试")
        return candidates

    async def extract_info(
        self, content: str, content_type: str = "text"
    ) -> ExtractionResult:
        candidates = await self.extract_candidates(content, content_type)
        return candidates[0]

    async def generate_outline(
        self, goal: str, context: str = ""
    ) -> list[OutlineNode]:
        raise AIProviderError("AI 目录生成能力尚未实现")

    async def ocr(self, image_data: bytes) -> str:
        raise AIProviderError("AI OCR 能力尚未实现")

    async def suggest_archive(
        self, entry: dict, nodes: list[dict]
    ) -> list[dict]:
        raise AIProviderError("AI 归档建议能力尚未实现")

    async def review(self, entries: list[dict]) -> list[ReviewResult]:
        raise AIProviderError("AI Review 能力尚未实现")

    async def expand_node(
        self, node_title: str, context: str
    ) -> list[dict]:
        raise AIProviderError("AI 节点拓展能力尚未实现")
