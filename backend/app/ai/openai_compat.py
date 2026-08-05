"""OpenAI 兼容 Provider 共用的 JSON 候选请求与结构化解析。"""

import json

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.ai.base import AIProviderError, ExtractionResult
from app.models.entries import EntryType

_ENTRY_TYPE_KEYS = ", ".join(f'"{value}"' for value in EntryType)

CANDIDATE_SYSTEM_PROMPT = (
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


def parse_candidate_items(items: list) -> list[ExtractionResult]:
    """校验 AI 输出的候选数组，失败抛可重试错误。"""
    candidates: list[ExtractionResult] = []
    for index, item in enumerate(items):
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


async def request_json_candidates(
    client,
    model: str,
    content: str,
    content_type: str = "text",
) -> list[ExtractionResult]:
    """以 JSON 模式请求候选并结构化解析。"""
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": CANDIDATE_SYSTEM_PROMPT},
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
    return parse_candidate_items(payload["candidates"])
