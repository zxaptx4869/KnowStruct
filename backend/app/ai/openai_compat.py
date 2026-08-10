"""OpenAI 兼容 Provider 共用的 JSON 候选请求与结构化解析。"""

import json

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.ai.base import (
    AIProviderError,
    ClarifyQuestion,
    ClarifyResult,
    ExtractionResult,
    OutlineAction,
    OutlineNode,
    ReviewResult,
)
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

OUTLINE_SYSTEM_PROMPT = (
    "你是 KnowStruct 的知识目录起草助手。用户会提供项目目标/背景与已采集资料摘要。"
    "请生成一份贴合装修资料整理场景的初始知识目录，最多 6 层。"
    '必须只输出一个 JSON 对象，格式为 {"nodes": [{"name": "节点名", '
    '"description": "节点说明（可空）", "children": [...]}]}。'
    "要求：节点名 1-100 字符且不能为空；同一父节点下名称不能重复；"
    "层级不超过 6 层。不要输出 JSON 之外的任何内容。"
)

CLARIFY_SYSTEM_PROMPT = (
    "你是 KnowStruct 的知识目录引导助手。判断给定的项目目标/背景与资料摘要"
    "是否足以生成初始知识目录。信息不足时生成引导问题以缩小范围。"
    '必须只输出一个 JSON 对象，格式为 {"needs_more": true, "questions": '
    '[{"id": "q1", "text": "问题", "type": "single" 或 "multi", '
    '"options": ["选项1", "选项2"]}]}。'
    "信息充足时输出 {\"needs_more\": false, \"questions\": []}。"
    "问题不超过 5 个，以选项为主，可带一个自由文本补充。"
    "type 判断规则：时长、数量、是否、单选偏好等互斥维度用 single；"
    "「目录希望涵盖的方面」「旅游目的」「装修重点」等可并存维度用 multi。"
    "每个问题最多 5 个选项；前端会自动附加「其他」选项并允许自由输入。"
    "不要输出 JSON 之外的任何内容。"
)

REFINE_SYSTEM_PROMPT = (
    "你是 KnowStruct 的知识目录调整助手。用户会提供当前目录草稿、用户意图说明"
    "和本次调整意见。请只按意见做增量修改，未提及的节点一律原样保留。"
    '必须只输出一个 JSON 对象，格式为 {"actions": [{"type": "add", "path": '
    '["父节点路径"], "name": "新节点名", "description": "说明"}, {"type": '
    '"rename", "path": ["节点路径"], "name": "新名称"}, {"type": "remove", '
    '"path": ["节点路径"]}, {"type": "move", "path": ["节点路径"], '
    '"to_parent_path": ["目标父路径"]}]}。'
    "path 是从根到目标节点的名称数组；add 的 path 是父节点路径（根为 []）。"
    "path 中的节点名必须与草稿完全一致，不得改写、缩写、翻译或增删字符；"
    "如果草稿中不存在该路径，请直接输出空 actions 并说明无法执行。"
    "不要输出 JSON 之外的任何内容。"
)

INTENT_SYSTEM_PROMPT = (
    "把用户的历史意图说明与本次调整意见浓缩成一段不超过 100 字的"
    "「当前有效意图说明」，保留用户的最新要求。"
    '必须只输出一个 JSON 对象，格式为 {"intent": "..."}。'
    "不要输出 JSON 之外的任何内容。"
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


def _node_from_dict(item: dict, depth: int) -> OutlineNode:
    if depth > 6:
        raise AIProviderError("AI 目录超过 6 层")
    title = str(item.get("name", "")).strip()
    if not title or len(title) > 100:
        raise AIProviderError("AI 目录节点名称无效")
    description = item.get("description")
    description = (
        str(description).strip()[:1000] if description is not None else None
    )
    children = [
        _node_from_dict(child, depth + 1)
        for child in item.get("children") or []
        if isinstance(child, dict)
    ]
    return OutlineNode(title=title, description=description, children=children)


async def _request_json(
    client,
    model: str,
    system_prompt: str,
    user_content: str,
) -> dict:
    """以 JSON 模式请求一次无状态调用并解析对象。"""
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
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
    if not isinstance(payload, dict):
        raise AIProviderError("AI 输出不是有效 JSON 对象，请重试")
    return payload


async def request_json_outline(
    client,
    model: str,
    goal: str,
    context: str = "",
) -> list[OutlineNode]:
    """请求候选目录树并结构化解析。"""
    payload = await _request_json(
        client,
        model,
        OUTLINE_SYSTEM_PROMPT,
        f"项目目标与背景：\n{goal}\n\n已采集资料摘要：\n{context or '（无）'}",
    )
    raw_nodes = payload.get("nodes")
    if not isinstance(raw_nodes, list):
        raise AIProviderError("AI 输出缺少 nodes 数组，请重试")
    return [_node_from_dict(item, 1) for item in raw_nodes if isinstance(item, dict)]


async def request_json_clarify(
    client,
    model: str,
    goal: str,
    context: str = "",
) -> ClarifyResult:
    """请求信息充分性判断与澄清问题。"""
    payload = await _request_json(
        client,
        model,
        CLARIFY_SYSTEM_PROMPT,
        f"项目目标与背景：\n{goal}\n\n已采集资料摘要：\n{context or '（无）'}",
    )
    needs_more = bool(payload.get("needs_more"))
    raw_questions = payload.get("questions")
    questions: list[ClarifyQuestion] = []
    if isinstance(raw_questions, list):
        for index, item in enumerate(raw_questions[:5]):
            if not isinstance(item, dict):
                continue
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            options = [
                str(option).strip()
                for option in (item.get("options") or [])
                if str(option).strip()
            ]
            questions.append(
                ClarifyQuestion(
                    id=str(item.get("id") or f"q{index + 1}"),
                    text=text,
                    options=options,
                    multiple=str(item.get("type", "")).lower() == "multi"
                    or bool(item.get("multiple", False)),
                )
            )
    return ClarifyResult(needs_more=needs_more, questions=questions)


async def request_json_refine(
    client,
    model: str,
    draft: list[dict],
    intent_note: str,
    instruction: str,
) -> list[OutlineAction]:
    """请求增量修改动作清单。"""
    payload = await _request_json(
        client,
        model,
        REFINE_SYSTEM_PROMPT,
        (
            f"当前目录草稿（JSON）：\n{json.dumps(draft, ensure_ascii=False)}\n\n"
            f"用户意图说明：\n{intent_note or '（无）'}\n\n"
            f"本次调整意见：\n{instruction}"
        ),
    )
    raw_actions = payload.get("actions")
    if not isinstance(raw_actions, list):
        raise AIProviderError("AI 输出缺少 actions 数组，请重试")
    actions: list[OutlineAction] = []
    for item in raw_actions:
        if not isinstance(item, dict):
            continue
        action_type = str(item.get("type", ""))
        if action_type not in ("add", "rename", "remove", "move"):
            raise AIProviderError("AI 增量修改包含未知动作类型，请重试")
        path = [str(part) for part in item.get("path") or [] if str(part)]
        actions.append(
            OutlineAction(
                type=action_type,
                path=path,
                name=str(item["name"]).strip() if item.get("name") else None,
                description=(
                    str(item["description"]).strip()
                    if item.get("description")
                    else None
                ),
                to_parent_path=(
                    [str(part) for part in item.get("to_parent_path") or [] if str(part)]
                    if item.get("to_parent_path")
                    else None
                ),
            )
        )
    return actions


async def request_json_intent(
    client,
    model: str,
    intent_note: str,
    instruction: str,
) -> str:
    """请求浓缩意图说明。"""
    payload = await _request_json(
        client,
        model,
        INTENT_SYSTEM_PROMPT,
        f"历史意图说明：\n{intent_note or '（无）'}\n\n本次调整意见：\n{instruction}",
    )
    intent = str(payload.get("intent", "")).strip()
    if not intent:
        raise AIProviderError("AI 意图浓缩输出为空，请重试")
    return intent[:500]


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
