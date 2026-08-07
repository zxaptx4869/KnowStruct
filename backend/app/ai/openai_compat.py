"""OpenAI 兼容 Provider 共用的 JSON 候选请求与结构化解析。"""

import json

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.ai.base import AIProviderError, ExtractionResult, ReviewResult
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

REVIEW_SYSTEM_PROMPT = (
    "你是知识库审查助手。用户会给你同一范围内多条正式知识记录。"
    "请两两比较，找出语义重复（duplicate）或给出相互矛盾结论（conflict）的记录。"
    '必须只输出一个 JSON 对象，格式为 {"findings": [{"review_type": '
    '"duplicate" 或 "conflict", "description": "发现说明与依据", '
    '"related_entry_ids": ["记录id1", "记录id2"], "suggestion": "可选的修改建议", '
    '"severity": "info" 或 "warning" 或 "error"}]}。'
    "related_entry_ids 必须至少包含 2 个且来自用户提供的记录 id。"
    "没有发现时输出 {\"findings\": []}。不要输出 JSON 之外的任何内容。"
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


class _ReviewFindingModel(BaseModel):
    review_type: str
    description: str = Field(min_length=1, max_length=2000)
    related_entry_ids: list[str] = Field(min_length=2, max_length=10)
    suggestion: str = Field(default="", max_length=1000)
    severity: str = "info"

    @field_validator("review_type")
    @classmethod
    def validate_review_type(cls, value: str) -> str:
        if value not in ("duplicate", "conflict", "missing", "expired", "risk"):
            raise ValueError(f"不支持的审查类型: {value}")
        return value

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, value: str) -> str:
        if value not in ("info", "warning", "error"):
            raise ValueError(f"不支持的严重度: {value}")
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


def parse_review_results(items: list) -> list[ReviewResult]:
    """校验 AI 输出的审查发现数组，失败抛可重试错误。"""
    results: list[ReviewResult] = []
    for index, item in enumerate(items):
        try:
            finding = _ReviewFindingModel.model_validate(item)
        except ValidationError as exc:
            first_error = exc.errors()[0] if exc.errors() else {}
            field_name = ".".join(str(part) for part in first_error.get("loc", ()))
            raise AIProviderError(
                f"AI 审查结果校验失败（第 {index + 1} 条，字段 {field_name or '未知'}）"
            ) from exc
        results.append(
            ReviewResult(
                review_type=finding.review_type,
                description=finding.description,
                related_entry_ids=finding.related_entry_ids,
                suggestion=finding.suggestion,
                severity=finding.severity,
            )
        )
    return results


async def request_json_review(
    client,
    model: str,
    entries: list[dict],
) -> list[ReviewResult]:
    """以 JSON 模式请求 AI 审查并结构化解析。"""
    payload = json.dumps(entries, ensure_ascii=False)
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"知识记录列表（JSON）：\n{payload}",
                },
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        raise AIProviderError(f"AI 服务调用失败：{exc}") from exc

    message = response.choices[0].message.content if response.choices else ""
    try:
        parsed = json.loads(message or "")
    except json.JSONDecodeError as exc:
        raise AIProviderError("AI 输出不是有效 JSON，请重试") from exc

    if not isinstance(parsed, dict) or not isinstance(parsed.get("findings"), list):
        raise AIProviderError("AI 输出缺少 findings 数组，请重试")
    return parse_review_results(parsed["findings"])
