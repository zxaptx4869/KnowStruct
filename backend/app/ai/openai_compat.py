"""OpenAI 兼容 Provider 共用的 JSON 候选请求、结构化解析与会话工具调用。"""

import asyncio
import json
import re

from openai import APIConnectionError, APITimeoutError
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.ai.base import (
    AIProviderError,
    ChatRoundResult,
    ClarifyQuestion,
    ClarifyResult,
    ExtractionResult,
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

INTENT_SYSTEM_PROMPT = (
    "把用户的历史意图说明与本次调整意见浓缩成一段不超过 100 字的"
    "「当前有效意图说明」，保留用户的最新要求。"
    '必须只输出一个 JSON 对象，格式为 {"intent": "..."}。'
    "不要输出 JSON 之外的任何内容。"
)

CHAT_SYSTEM_PROMPT = (
    "你是 KnowStruct 的知识目录共创助手。当前项目正在起草一份知识目录候选树，"
    "你可以与用户讨论目录结构，或按讨论结果应用目录。"
    "只有当用户明确要求应用/确定目录时，才调用 apply_directory_tree 工具提交"
    "完整目标树；纯讨论（提问、解释、权衡、提建议）绝不调用工具，只返回文字。"
    "目录约束：节点名称 1-100 字符且不能为空；同一父节点下名称不能重复；"
    "层级不超过 6 层；节点说明最多 1000 字符。"
    "应用时输出完整目标树（嵌套 JSON，包含全部仍应保留的节点，不包含任何 id），"
    "不得把完整树当成增量修改。"
)

APPLY_DIRECTORY_TREE_TOOL = {
    "type": "function",
    "function": {
        "name": "apply_directory_tree",
        "description": (
            "把完整目标目录树应用到候选草稿。仅当用户明确要求应用/确定目录时调用；"
            "纯讨论绝不调用。参数为嵌套 JSON，包含全部节点（不是增量修改），"
            "不包含任何 id。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "nodes": {
                    "type": "array",
                    "description": "根节点数组；每项含 name（1-100 字符）、"
                    "description（可选，≤1000 字符）与 children（子节点数组，结构与父节点相同）。",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "children": {
                                "type": "array",
                                "items": {"type": "object"},
                            },
                        },
                        "required": ["name"],
                    },
                }
            },
            "required": ["nodes"],
        },
    },
}

CHAT_RETRY_DELAYS = (2.0, 4.0)


def _parse_json_content(content: str) -> dict:
    """从 AI 输出中解析 JSON 对象，容忍 Markdown 围栏与前后杂质。"""
    text = (content or "").strip()
    if not text:
        raise AIProviderError("AI 输出为空，请重试")
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 2:
            text = "\n".join(lines[1:])
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
        text = text.strip()
    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char not in "{[":
            continue
        try:
            payload, _ = decoder.raw_decode(text[index:])
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            continue
    raise AIProviderError("AI 输出不是有效 JSON，请重试")


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
        payload = _parse_json_content(message or "")
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


async def _chat_completion_with_retry(
    client,
    *,
    retry_delays: tuple[float, ...] | None = None,
    **kwargs: object,
):
    """调用 chat.completions.create；连接类错误按退避做有限重试，其余错误直接包装。"""
    delays = CHAT_RETRY_DELAYS if retry_delays is None else retry_delays
    attempt = 0
    while True:
        try:
            return await client.chat.completions.create(**kwargs)
        except (APIConnectionError, APITimeoutError) as exc:
            if attempt >= len(delays):
                raise AIProviderError(f"AI 服务调用失败：{exc}") from exc
            await asyncio.sleep(delays[attempt])
            attempt += 1
        except Exception as exc:
            raise AIProviderError(f"AI 服务调用失败：{exc}") from exc


async def _request_json(
    client,
    model: str,
    system_prompt: str,
    user_content: str,
) -> dict:
    """以 JSON 模式请求一次无状态调用并解析对象。"""
    response = await _chat_completion_with_retry(
        client,
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    message = response.choices[0].message.content if response.choices else ""
    try:
        payload = _parse_json_content(message or "")
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


def _parse_marker_tree(text: str) -> list[dict] | None:
    """工具调用不可用时，从模型文本中解析约定标记块（```directory-tree JSON```）。"""
    fence = re.search(
        r"```(?:directory-tree|json)\s*\n(.*?)\n```",
        text or "",
        re.DOTALL,
    )
    if fence:
        try:
            payload = json.loads(fence.group(1))
        except json.JSONDecodeError:
            payload = None
        nodes = payload.get("nodes") if isinstance(payload, dict) else None
        if isinstance(nodes, list):
            return nodes
    try:
        payload = _parse_json_content(text or "")
    except AIProviderError:
        return None
    nodes = payload.get("nodes")
    return nodes if isinstance(nodes, list) else None


async def request_chat_round(
    client,
    model: str,
    tree: list[dict],
    messages: list[dict],
    summary: str | None = None,
) -> ChatRoundResult:
    """带 apply_directory_tree 工具的一次会话轮调用：解析工具调用或回退文本标记。"""
    system_content = (
        CHAT_SYSTEM_PROMPT
        + f"\n\n当前候选目录树（JSON）：\n{json.dumps(tree, ensure_ascii=False)}"
    )
    if summary:
        system_content += f"\n\n早期对话摘要（已压缩）：\n{summary}"
    response = await _chat_completion_with_retry(
        client,
        model=model,
        messages=[{"role": "system", "content": system_content}, *messages],
        tools=[APPLY_DIRECTORY_TREE_TOOL],
        tool_choice="auto",
        temperature=0.3,
    )

    message = response.choices[0].message if response.choices else None
    if message is None:
        raise AIProviderError("AI 服务未返回结果，请重试")
    text = (message.content or "").strip()

    if message.tool_calls:
        for call in message.tool_calls:
            if call.function.name != "apply_directory_tree":
                continue
            try:
                args = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError as exc:
                raise AIProviderError("AI 工具调用参数不是有效 JSON，请重试") from exc
            nodes = args.get("nodes") if isinstance(args, dict) else None
            if not isinstance(nodes, list):
                raise AIProviderError("AI 工具调用缺少 nodes 数组，请重试")
            return ChatRoundResult(
                reply_text=text or "（已提交目录树）",
                tree=nodes,
            )

    return ChatRoundResult(reply_text=text, tree=_parse_marker_tree(text))


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
        parsed = _parse_json_content(message or "")
    except json.JSONDecodeError as exc:
        raise AIProviderError("AI 输出不是有效 JSON，请重试") from exc

    if not isinstance(parsed, dict) or not isinstance(parsed.get("findings"), list):
        raise AIProviderError("AI 输出缺少 findings 数组，请重试")
    return parse_review_results(parsed["findings"])
