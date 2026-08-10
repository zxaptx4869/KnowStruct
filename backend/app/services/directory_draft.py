"""AI 目录起草候选服务：生命周期、校验、增量修改与确认创建。"""

import json
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AIProvider
from app.ai.base import AIProviderError, OutlineNode
from app.api.errors import ConflictError, ResourceNotFoundError
from app.models import (
    DirectoryDraft,
    DirectoryDraftMessage,
    DirectoryDraftNode,
    DraftNextAction,
    DraftStatus,
    Node,
    Project,
    Source,
)
from app.services.nodes import list_nodes, touch_project
from app.services.projects import get_project
from app.utils.tree import (
    MAX_TREE_DEPTH,
    ancestor_ids,
    index_nodes,
    node_depth,
    normalize_node_name,
    sibling_scope,
)

MAX_SOURCE_SUMMARY_CHARS = 6000
ACTIVE_STATUSES = DraftStatus.ACTIVE
MAX_MESSAGE_CHARS = 2000
MAX_CONVERSATION_ROUNDS = 30
KEEP_FULL_ROUNDS = 10
MAX_SELF_HEAL_RETRIES = 2


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _draft_not_found() -> ResourceNotFoundError:
    return ResourceNotFoundError("directory_draft")


async def get_draft(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    draft_id: str,
) -> DirectoryDraft:
    await get_project(db, workspace_id, project_id)
    draft = await db.scalar(
        select(DirectoryDraft).where(
            DirectoryDraft.id == draft_id,
            DirectoryDraft.project_id == project_id,
        )
    )
    if draft is None:
        raise _draft_not_found()
    return draft


async def get_active_draft(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
) -> DirectoryDraft | None:
    await get_project(db, workspace_id, project_id)
    return await db.scalar(
        select(DirectoryDraft)
        .where(
            DirectoryDraft.project_id == project_id,
            DirectoryDraft.status.in_(ACTIVE_STATUSES),
        )
        .order_by(DirectoryDraft.created_at.desc())
        .limit(1)
    )


def _project_goal_text(project: Project, background_override: str | None) -> str:
    parts = [project.name]
    if project.goal:
        parts.append(project.goal)
    if background_override:
        parts.append(background_override)
    elif project.background:
        parts.append(project.background)
    return "\n".join(parts)


async def _source_summary(db: AsyncSession, project_id: str) -> str:
    sources = (
        await db.scalars(
            select(Source)
            .where(Source.project_id == project_id)
            .order_by(Source.created_at)
            .limit(20)
        )
    ).all()
    parts: list[str] = []
    for source in sources:
        text = source.content or source.link_url or ""
        parts.append(f"- {source.title}: {text[:500]}")
    return "\n".join(parts)[:MAX_SOURCE_SUMMARY_CHARS]


async def create_draft(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    background: str | None = None,
) -> DirectoryDraft:
    project = await get_project(db, workspace_id, project_id)
    node_count = await db.scalar(
        select(func.count(Node.id)).where(Node.project_id == project.id)
    )
    if node_count:
        raise ConflictError(
            "draft_requires_empty_project",
            "仅空项目支持 AI 起草目录",
        )
    active = await get_active_draft(db, workspace_id, project_id)
    if active is not None:
        raise ConflictError("draft_already_active", "该项目已有待处理的 AI 草稿")
    draft = DirectoryDraft(
        project_id=project.id,
        status=DraftStatus.DRAFTING,
        next_action=DraftNextAction.CLARIFY,
        background_snapshot=background,
    )
    db.add(draft)
    await db.flush()
    return draft


async def discard_active_draft(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
) -> None:
    """手动创建节点时作废当前活跃草稿；无草稿时静默通过。"""
    draft = await get_active_draft(db, workspace_id, project_id)
    if draft is not None:
        draft.status = DraftStatus.DISCARDED
        draft.finished_at = utc_now()


async def recover_stale_drafts(db: AsyncSession, stale_seconds: int) -> int:
    cutoff = utc_now() - timedelta(seconds=stale_seconds)
    result = await db.execute(
        update(DirectoryDraft)
        .where(
            DirectoryDraft.status == DraftStatus.DRAFTING,
            DirectoryDraft.claimed_at < cutoff,
        )
        .values(claimed_at=None)
    )
    await db.commit()
    return result.rowcount or 0


def _validate_outline(
    nodes: list[OutlineNode],
    *,
    depth: int = 1,
    siblings: set[str] | None = None,
) -> None:
    if depth > MAX_TREE_DEPTH:
        raise AIProviderError("AI 目录超过 6 层，请重试")
    seen = set(siblings or [])
    for node in nodes:
        normalized = normalize_node_name(node.title)
        if not node.title or len(node.title) > 100:
            raise AIProviderError("AI 目录存在无效节点名称，请重试")
        if normalized in seen:
            raise AIProviderError("AI 目录存在同级重名节点，请重试")
        seen.add(normalized)
        _validate_outline(node.children, depth=depth + 1)


async def replace_draft_nodes(
    db: AsyncSession,
    draft: DirectoryDraft,
    outline: list[OutlineNode],
) -> None:
    _validate_outline(outline)
    await db.execute(
        delete(DirectoryDraftNode).where(
            DirectoryDraftNode.draft_id == draft.id
        )
    )
    await db.flush()

    created_by_parent: dict[str | None, list[DirectoryDraftNode]] = {None: []}
    pending: list[tuple[OutlineNode, str | None, int]] = [
        (node, None, index) for index, node in enumerate(outline)
    ]
    while pending:
        outline_node, parent_id, sort_order = pending.pop(0)
        draft_node = DirectoryDraftNode(
            draft_id=draft.id,
            parent_id=parent_id,
            name=outline_node.title,
            normalized_name=normalize_node_name(outline_node.title),
            description=outline_node.description,
            selected=True,
            sort_order=sort_order,
        )
        db.add(draft_node)
        await db.flush()
        created_by_parent.setdefault(parent_id, []).append(draft_node)
        for index, child in enumerate(outline_node.children):
            pending.append((child, draft_node.id, index))


async def _draft_tree_nodes(
    db: AsyncSession,
    draft: DirectoryDraft,
) -> list[DirectoryDraftNode]:
    nodes = list(
        (
            await db.scalars(
                select(DirectoryDraftNode).where(
                    DirectoryDraftNode.draft_id == draft.id
                )
            )
        ).all()
    )
    nodes.sort(key=lambda node: (node.parent_id or "", node.sort_order, node.id))
    return nodes


async def draft_payload(
    db: AsyncSession,
    draft: DirectoryDraft,
) -> dict:
    await db.refresh(draft)
    nodes = await _draft_tree_nodes(db, draft)
    messages = await list_draft_messages(db, draft.id)
    clarify = json.loads(draft.clarify_json or "[]")
    return {
        "id": draft.id,
        "project_id": draft.project_id,
        "status": draft.status,
        "next_action": draft.next_action,
        "intent_note": draft.intent_note,
        "clarify": clarify,
        "nodes": [
            {
                "id": node.id,
                "parent_id": node.parent_id,
                "name": node.name,
                "description": node.description,
                "selected": node.selected,
                "sort_order": node.sort_order,
            }
            for node in nodes
        ],
        "messages": [
            {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "created_at": message.created_at,
            }
            for message in messages
        ],
        "last_error": draft.last_error,
        "created_at": draft.created_at,
        "updated_at": draft.updated_at,
    }


def _tree_dicts_to_outline(
    items: list[dict],
    *,
    depth: int = 1,
    path: tuple[str, ...] = (),
) -> list[OutlineNode]:
    """把模型提交的完整嵌套树转为 OutlineNode 并做严格校验（含路径化错误反馈）。"""
    if depth > MAX_TREE_DEPTH:
        raise AIProviderError(
            f"目录层级超过 {MAX_TREE_DEPTH} 层：{' / '.join(path) or '根目录'}"
        )
    result: list[OutlineNode] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            raise AIProviderError("目录树节点必须是对象，请检查提交格式")
        name = str(item.get("name", "")).strip()
        node_path = (*path, name or "（空名称）")
        label = " / ".join(node_path)
        if not name or len(name) > 100:
            raise AIProviderError(f"节点名称需为 1-100 字符：{label}")
        normalized = normalize_node_name(name)
        if normalized in seen:
            raise AIProviderError(f"同一父节点下存在重名节点：{label}")
        seen.add(normalized)
        description = item.get("description")
        if description is not None:
            description = str(description).strip()
            if len(description) > 1000:
                raise AIProviderError(f"节点说明最多 1000 字符：{label}")
            description = description or None
        children = _tree_dicts_to_outline(
            item.get("children") or [],
            depth=depth + 1,
            path=node_path,
        )
        result.append(
            OutlineNode(title=name, description=description, children=children)
        )
    return result


async def list_draft_messages(
    db: AsyncSession,
    draft_id: str,
) -> list[DirectoryDraftMessage]:
    return list(
        (
            await db.scalars(
                select(DirectoryDraftMessage)
                .where(DirectoryDraftMessage.draft_id == draft_id)
                .order_by(
                    DirectoryDraftMessage.created_at,
                    DirectoryDraftMessage.id,
                )
            )
        ).all()
    )


async def _append_draft_message(
    db: AsyncSession,
    draft_id: str,
    role: str,
    content: str,
) -> None:
    db.add(
        DirectoryDraftMessage(
            draft_id=draft_id,
            role=role,
            content=content,
        )
    )
    await db.flush()


def _compose_early_summary_text(
    messages: list[DirectoryDraftMessage],
) -> str:
    role_label = {"user": "用户", "assistant": "助手", "system": "系统"}
    return "\n".join(
        f"{role_label.get(message.role, message.role)}：{message.content}"
        for message in messages
    )[:4000]


async def _compress_history(
    db: AsyncSession,
    draft: DirectoryDraft,
    provider: AIProvider,
    messages: list[DirectoryDraftMessage],
) -> None:
    """保留最近 KEEP_FULL_ROUNDS 轮，更早轮次压缩为早期意图摘要（失败则丢弃）。"""
    user_indexes = [
        index
        for index, message in enumerate(messages)
        if message.role == "user"
    ]
    if len(user_indexes) <= KEEP_FULL_ROUNDS:
        return
    cutoff = user_indexes[-KEEP_FULL_ROUNDS]
    early = messages[:cutoff]
    if not early:
        return
    if not draft.intent_note:
        try:
            draft.intent_note = await provider.summarize_intent(
                "",
                _compose_early_summary_text(early),
            )
        except AIProviderError:
            draft.intent_note = None
    for message in early:
        await db.delete(message)
    await db.flush()


async def submit_draft_message(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    draft_id: str,
    content: str,
    provider: AIProvider,
) -> tuple[DirectoryDraft, list[DirectoryDraftMessage]]:
    """会话轮：追加用户消息 → 注入最新候选树调用模型 → 应用/反馈 → 有界自愈重试。"""
    draft = await get_draft(db, workspace_id, project_id, draft_id)
    if draft.status != DraftStatus.PENDING_CONFIRM:
        raise ConflictError("draft_not_confirmable", "草稿当前不能会话调整")
    content = content.strip()
    if not content:
        raise ConflictError("message_empty", "消息内容不能为空")
    if len(content) > MAX_MESSAGE_CHARS:
        raise ConflictError(
            "message_too_long",
            f"消息最长 {MAX_MESSAGE_CHARS} 字符",
        )

    if draft.conversation_rounds >= MAX_CONVERSATION_ROUNDS:
        raise ConflictError(
            "draft_conversation_limit",
            f"会话轮次已达上限（{MAX_CONVERSATION_ROUNDS}），请重新起草开启新会话",
        )

    await _append_draft_message(db, draft.id, "user", content)
    draft.conversation_rounds = draft.conversation_rounds + 1
    await db.flush()
    messages = await list_draft_messages(db, draft.id)
    await _compress_history(db, draft, provider, messages)
    messages = await list_draft_messages(db, draft.id)

    tree = await draft_tree_json(db, draft)
    convo = [
        {"role": message.role, "content": message.content}
        for message in messages
    ]
    retries = 0
    while True:
        try:
            result = await provider.draft_chat(
                tree,
                convo,
                summary=draft.intent_note,
            )
        except AIProviderError as exc:
            await _append_draft_message(
                db,
                draft.id,
                "system",
                f"未应用变更：{exc}。草稿未改动，可重发或换个说法。",
            )
            break
        if result.tree is None:
            await _append_draft_message(
                db,
                draft.id,
                "assistant",
                result.reply_text.strip() or "（已收到你的消息）",
            )
            break
        try:
            outline = _tree_dicts_to_outline(result.tree)
            await replace_draft_nodes(db, draft, outline)
            node_count = _count_outline(outline)
            await _append_draft_message(
                db,
                draft.id,
                "assistant",
                result.reply_text.strip() or "（已提交目录树）",
            )
            await _append_draft_message(
                db,
                draft.id,
                "system",
                f"已应用目录，共 {node_count} 个节点",
            )
            break
        except AIProviderError as exc:
            feedback = f"未应用变更：{exc}"
            await _append_draft_message(db, draft.id, "system", feedback)
            convo.append({"role": "system", "content": feedback})
            if retries >= MAX_SELF_HEAL_RETRIES:
                await _append_draft_message(
                    db,
                    draft.id,
                    "system",
                    "已停止自动重试，请人工处理：可直接在目录预览中修改，或修改描述后重新发送。",
                )
                break
            retries += 1

    return draft, await list_draft_messages(db, draft.id)


def _count_outline(nodes: list[OutlineNode]) -> int:
    return len(nodes) + sum(_count_outline(node.children) for node in nodes)


async def draft_tree_json(db: AsyncSession, draft: DirectoryDraft) -> list[dict]:
    nodes = await _draft_tree_nodes(db, draft)
    by_parent: dict[str | None, list[DirectoryDraftNode]] = {}
    for node in nodes:
        by_parent.setdefault(node.parent_id, []).append(node)
    for children in by_parent.values():
        children.sort(key=lambda item: (item.sort_order, item.id))

    def build(parent_id: str | None) -> list[dict]:
        result: list[dict] = []
        for node in by_parent.get(parent_id, []):
            result.append(
                {
                    "name": node.name,
                    "description": node.description,
                    "children": build(node.id),
                }
            )
        return result

    return build(None)


async def generate_draft_step(
    db: AsyncSession,
    draft: DirectoryDraft,
    provider: AIProvider,
) -> None:
    project = await db.get(Project, draft.project_id)
    if project is None:
        raise _draft_not_found()
    goal = _project_goal_text(project, draft.background_snapshot)
    context = await _source_summary(db, project.id)

    if draft.next_action == DraftNextAction.CLARIFY:
        clarify = await provider.draft_clarify(goal, context)
        if clarify.needs_more and clarify.questions:
            draft.clarify_json = json.dumps(
                [
                    {
                        "id": q.id,
                        "text": q.text,
                        "options": q.options,
                        "multiple": q.multiple,
                    }
                    for q in clarify.questions
                ],
                ensure_ascii=False,
            )
            draft.status = DraftStatus.AWAITING_INPUT
            draft.finished_at = utc_now()
            return
        draft.clarify_json = "[]"
        draft.next_action = DraftNextAction.GENERATE

    if draft.next_action == DraftNextAction.GENERATE:
        answers = json.loads(draft.clarify_answers_json or "{}")
        answer_text = "\n".join(
            f"{key}: {', '.join(value) if isinstance(value, list) else value}"
            for key, value in answers.items()
            if value
        )
        outline = await provider.generate_outline(
            goal,
            f"{context}\n\n用户澄清答案：\n{answer_text or '（未回答）'}",
        )
        await replace_draft_nodes(db, draft, outline)
        draft.status = DraftStatus.PENDING_CONFIRM
        draft.finished_at = utc_now()
        return

    if draft.next_action == DraftNextAction.REFINE:
        raise AIProviderError(
            "指令式微调已升级为会话式微调，请重新起草后直接在会话中沟通"
        )


async def submit_clarify_answers(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    draft_id: str,
    answers: dict[str, str],
) -> DirectoryDraft:
    draft = await get_draft(db, workspace_id, project_id, draft_id)
    if draft.status != DraftStatus.AWAITING_INPUT:
        raise ConflictError("draft_not_awaiting_input", "草稿当前不需要澄清")
    draft.clarify_answers_json = json.dumps(answers, ensure_ascii=False)
    draft.next_action = DraftNextAction.GENERATE
    draft.status = DraftStatus.DRAFTING
    draft.last_error = None
    draft.finished_at = None
    draft.claimed_at = None
    return draft


async def redraft(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    draft_id: str,
    background: str | None,
) -> DirectoryDraft:
    draft = await get_draft(db, workspace_id, project_id, draft_id)
    if draft.status not in (DraftStatus.PENDING_CONFIRM, DraftStatus.FAILED):
        raise ConflictError("draft_not_redraftable", "草稿当前不能重新起草")
    await db.execute(
        delete(DirectoryDraftNode).where(
            DirectoryDraftNode.draft_id == draft.id
        )
    )
    messages = await list_draft_messages(db, draft.id)
    for message in messages:
        await db.delete(message)
    await db.flush()
    draft.background_snapshot = background
    draft.clarify_json = None
    draft.clarify_answers_json = None
    draft.refine_instruction = None
    draft.intent_note = None
    draft.conversation_rounds = 0
    draft.last_error = None
    draft.next_action = DraftNextAction.CLARIFY
    draft.status = DraftStatus.DRAFTING
    draft.finished_at = None
    draft.claimed_at = None
    return draft


async def retry_draft(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    draft_id: str,
) -> DirectoryDraft:
    draft = await get_draft(db, workspace_id, project_id, draft_id)
    if draft.status != DraftStatus.FAILED:
        raise ConflictError("draft_not_failed", "草稿当前无需重试")
    draft.status = DraftStatus.DRAFTING
    draft.last_error = None
    draft.finished_at = None
    draft.claimed_at = None
    return draft


async def discard_draft(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    draft_id: str,
) -> DirectoryDraft:
    draft = await get_draft(db, workspace_id, project_id, draft_id)
    if draft.status in (DraftStatus.CONFIRMED, DraftStatus.DISCARDED):
        raise ConflictError("draft_already_terminal", "草稿已结束，不能放弃")
    draft.status = DraftStatus.DISCARDED
    draft.finished_at = utc_now()
    return draft


async def edit_draft_node(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    draft_id: str,
    node_id: str,
    *,
    name: str | None = None,
    selected: bool | None = None,
) -> DirectoryDraftNode:
    draft = await get_draft(db, workspace_id, project_id, draft_id)
    if draft.status != DraftStatus.PENDING_CONFIRM:
        raise ConflictError("draft_not_confirmable", "草稿当前不能编辑")
    nodes = await _draft_tree_nodes(db, draft)
    node = next((item for item in nodes if item.id == node_id), None)
    if node is None:
        raise ResourceNotFoundError("directory_draft_node")
    if name is not None:
        stripped = name.strip()
        if not stripped or len(stripped) > 100:
            raise ConflictError("invalid_node_name", "节点名称需为 1-100 字符")
        if any(
            item.parent_id == node.parent_id
            and item.normalized_name == normalize_node_name(stripped)
            and item.id != node.id
            for item in nodes
        ):
            raise ConflictError("duplicate_node_name", "同级目录中已存在同名节点")
        node.name = stripped
        node.normalized_name = normalize_node_name(stripped)
    if selected is not None:
        node.selected = selected
    return node


async def delete_draft_node(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    draft_id: str,
    node_id: str,
) -> DirectoryDraft:
    draft = await get_draft(db, workspace_id, project_id, draft_id)
    if draft.status != DraftStatus.PENDING_CONFIRM:
        raise ConflictError("draft_not_confirmable", "草稿当前不能编辑")
    await db.execute(
        delete(DirectoryDraftNode).where(
            DirectoryDraftNode.draft_id == draft.id,
            DirectoryDraftNode.id == node_id,
        )
    )
    return draft


async def confirm_draft(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    draft_id: str,
) -> tuple[DirectoryDraft, int]:
    draft = await get_draft(db, workspace_id, project_id, draft_id)
    if draft.status == DraftStatus.CONFIRMED:
        return draft, 0
    if draft.status != DraftStatus.PENDING_CONFIRM:
        raise ConflictError("draft_not_confirmable", "草稿当前不能确认")

    nodes = await _draft_tree_nodes(db, draft)
    index = {node.id: node for node in nodes}
    selected_ids = {node.id for node in nodes if node.selected}
    for node_id in list(selected_ids):
        for ancestor_id in ancestor_ids(node_id, index):
            selected_ids.add(ancestor_id)
    selected = [node for node in nodes if node.id in selected_ids]
    if not selected:
        raise ConflictError("draft_empty_selection", "请至少勾选一个节点")

    # 校验选中树：同级唯一、深度
    _validate_draft_tree(selected)

    project, existing_nodes = await list_nodes(
        db,
        workspace_id,
        project_id,
        for_update=True,
    )
    created: dict[str, Node] = {}
    ordered: list[DirectoryDraftNode] = []
    ordered_ids: set[str] = set()
    remaining = list(selected)
    while remaining:
        progressed = False
        for node in list(remaining):
            if node.parent_id is None or node.parent_id in ordered_ids:
                ordered.append(node)
                remaining.remove(node)
                ordered_ids.add(node.id)
                progressed = True
        if not progressed:
            raise ConflictError("draft_tree_invalid", "草稿目录结构无效")

    for draft_node in ordered:
        parent = created.get(draft_node.parent_id) if draft_node.parent_id else None
        parent_id = parent.id if parent else None
        normalized = normalize_node_name(draft_node.name)
        all_nodes = [*existing_nodes, *created.values()]
        _ensure_real_sibling_unique(all_nodes, parent_id, normalized)
        if parent is not None and node_depth(parent.id, index_nodes(all_nodes)) >= MAX_TREE_DEPTH:
            raise ConflictError("node_depth_exceeded", "知识目录最多支持 6 层")
        siblings = [
            item for item in all_nodes if item.parent_id == parent_id
        ]
        node = Node(
            id=str(uuid.uuid4()),
            project_id=project.id,
            parent_id=parent_id,
            sibling_scope=sibling_scope(project.id, parent_id),
            name=draft_node.name,
            normalized_name=normalized,
            description=draft_node.description,
            sort_order=len(siblings),
        )
        db.add(node)
        created[draft_node.id] = node

    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError("duplicate_node_name", "同级目录中已存在同名节点") from exc

    draft.status = DraftStatus.CONFIRMED
    draft.finished_at = utc_now()
    touch_project(project)
    return draft, len(ordered)


def _validate_draft_tree(nodes: list[DirectoryDraftNode]) -> None:
    index = index_nodes(nodes)
    for node in nodes:
        depth = node_depth(node.id, index)
        if depth > MAX_TREE_DEPTH:
            raise ConflictError("node_depth_exceeded", "知识目录最多支持 6 层")
    seen: dict[tuple[str | None, str], str] = {}
    for node in nodes:
        key = (node.parent_id, node.normalized_name)
        if key in seen and seen[key] != node.id:
            raise ConflictError("duplicate_node_name", "同级目录中已存在同名节点")
        seen[key] = node.id


def _ensure_real_sibling_unique(
    nodes: list[Node],
    parent_id: str | None,
    normalized_name: str,
) -> None:
    if any(
        node.parent_id == parent_id
        and node.normalized_name == normalized_name
        for node in nodes
    ):
        raise ConflictError("duplicate_node_name", "同级目录中已存在同名节点")
