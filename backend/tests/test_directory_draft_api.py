import copy
from types import SimpleNamespace

import httpx
import pytest
from httpx import AsyncClient
from openai import APIConnectionError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import (
    AIProviderError,
    ChatRoundResult,
    ClarifyQuestion,
    ClarifyResult,
    OutlineNode,
)
from app.ai.demo import DemoProvider
from app.ai.openai_compat import (
    _parse_json_content,
    request_chat_round,
)
from app.models import (
    DirectoryDraft,
    DirectoryDraftMessage,
    DraftStatus,
    Project,
)
from app.services.accounts import create_account
from app.services.directory_draft import submit_draft_message, utc_now
from app.services.task_worker import process_next_draft
from tests.test_inbox_api import create_project, login_owner


@pytest.fixture(autouse=True)
def _demo_provider_for_chat_api(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """让走 API 的会话轮在测试环境使用确定性 DemoProvider。"""
    import app.api.drafts as drafts_api

    async def _fake_provider(db: AsyncSession, workspace_id: str) -> DemoProvider:
        return DemoProvider()

    monkeypatch.setattr(drafts_api, "get_ai_provider", _fake_provider)


class ClarifyProvider(DemoProvider):
    """始终要求澄清的演示 Provider。"""

    async def draft_clarify(
        self, goal: str, context: str = ""
    ) -> ClarifyResult:
        return ClarifyResult(
            needs_more=True,
            questions=[
                ClarifyQuestion(
                    id="q1",
                    text="目前处于装修哪个阶段？",
                    options=["设计", "施工", "采购"],
                ),
                ClarifyQuestion(
                    id="q2",
                    text="需要重点覆盖哪些方向？",
                    options=["硬装施工", "主材选购", "家电家具", "灯光氛围"],
                    multiple=True,
                ),
            ],
        )


class FailingProvider(DemoProvider):
    async def generate_outline(
        self, goal: str, context: str = ""
    ) -> list[OutlineNode]:
        raise AIProviderError("模拟 AI 生成失败")


def _deep_tree(depth: int) -> OutlineNode:
    if depth <= 0:
        return OutlineNode(title="叶子")
    return OutlineNode(title="层级", children=[_deep_tree(depth - 1)])


class TooDeepProvider(DemoProvider):
    async def generate_outline(
        self, goal: str, context: str = ""
    ) -> list[OutlineNode]:
        return [_deep_tree(7)]


class AlwaysInvalidChatProvider(DemoProvider):
    """每次都提交含同级重名的非法树，验证超限转人工。"""

    async def draft_chat(
        self,
        tree: list[dict],
        messages: list[dict],
        summary: str | None = None,
    ) -> ChatRoundResult:
        bad = [
            {"name": "重复根", "description": None, "children": []},
            {"name": "重复根", "description": None, "children": []},
        ]
        return ChatRoundResult(reply_text="提交一版。", tree=bad)


class FailingChatProvider(DemoProvider):
    """模拟模型调用连接失败。"""

    async def draft_chat(
        self,
        tree: list[dict],
        messages: list[dict],
        summary: str | None = None,
    ) -> ChatRoundResult:
        raise AIProviderError("模拟 AI 连接失败")


class RecordingChatProvider(DemoProvider):
    """记录每次调用注入的候选树，验证「每次注入最新树」。"""

    def __init__(self) -> None:
        super().__init__()
        self.seen_trees: list[list[dict]] = []

    async def draft_chat(
        self,
        tree: list[dict],
        messages: list[dict],
        summary: str | None = None,
    ) -> ChatRoundResult:
        self.seen_trees.append(copy.deepcopy(tree))
        return await super().draft_chat(tree, messages, summary)


async def _create_generated_draft(
    client: AsyncClient,
    db: AsyncSession,
) -> dict:
    await login_owner(client, db)
    project = await create_project(client, "新房装修")
    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"background": "准备进入施工和采购阶段"},
    )
    assert response.status_code == 201
    draft_id = response.json()["id"]
    assert await process_next_draft(db, DemoProvider()) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    return {"project": project, "draft": body, "draft_id": draft_id}


@pytest.mark.asyncio
async def test_create_and_generate_outline(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "新房装修")

    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"background": "准备进入施工和采购阶段"},
    )
    assert response.status_code == 201
    assert response.json()["status"] == "drafting"

    assert await process_next_draft(db, DemoProvider()) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    root_names = [
        node["name"] for node in body["nodes"] if node["parent_id"] is None
    ]
    assert "硬装施工模块" in root_names
    assert "家具家电" in root_names
    assert all(node["selected"] for node in body["nodes"])


@pytest.mark.asyncio
async def test_clarify_round_then_generate(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "新房装修")
    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"background": ""},
    )
    assert response.status_code == 201
    draft_id = response.json()["id"]

    assert await process_next_draft(db, ClarifyProvider()) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "awaiting_input"
    assert len(body["clarify"]) == 2
    assert body["clarify"][0]["options"] == ["设计", "施工", "采购"]
    assert body["clarify"][0]["multiple"] is False
    assert body["clarify"][1]["multiple"] is True

    response = await client.post(
        f"/api/projects/{project['id']}/drafts/{draft_id}/clarify",
        json={"answers": {"q1": "施工", "q2": ["硬装施工", "灯光氛围"]}},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "drafting"

    assert await process_next_draft(db, DemoProvider()) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    assert len(body["nodes"]) > 0


@pytest.mark.asyncio
async def test_single_active_draft_and_empty_project_guard(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "新房装修")
    response = await client.post(f"/api/projects/{project['id']}/drafts", json={})
    assert response.status_code == 201

    response = await client.post(f"/api/projects/{project['id']}/drafts", json={})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "draft_already_active"

    other = await create_project(client, "另一个项目")
    created = await client.post(
        f"/api/projects/{other['id']}/nodes",
        json={"name": "已有节点"},
    )
    assert created.status_code == 201
    response = await client.post(f"/api/projects/{other['id']}/drafts", json={})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "draft_requires_empty_project"


@pytest.mark.asyncio
async def test_claimed_draft_is_not_reclaimed(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "新房装修")
    await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"background": "背景"},
    )
    draft = await db.scalar(
        select(DirectoryDraft).where(DirectoryDraft.project_id == project["id"])
    )
    assert draft is not None
    draft.status = DraftStatus.DRAFTING
    draft.claimed_at = utc_now()
    await db.commit()

    assert await process_next_draft(db, DemoProvider()) is False


def test_parse_json_content_tolerates_markdown_fences() -> None:
    payload = _parse_json_content('```json\n{"nodes": []}\n```')
    assert payload == {"nodes": []}


def test_parse_json_content_tolerates_trailing_text() -> None:
    payload = _parse_json_content('好的，这是结果：{"a": 1} 希望对你有帮助')
    assert payload == {"a": 1}


def test_parse_json_content_rejects_invalid() -> None:
    with pytest.raises(AIProviderError):
        _parse_json_content("这不是 JSON")


@pytest.mark.asyncio
async def test_failure_and_retry(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "新房装修")
    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"background": "背景"},
    )
    draft_id = response.json()["id"]

    assert await process_next_draft(db, FailingProvider()) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "failed"
    assert "模拟 AI 生成失败" in (body["last_error"] or "")

    response = await client.post(
        f"/api/projects/{project['id']}/drafts/{draft_id}/retry",
    )
    assert response.status_code == 200
    assert response.json()["status"] == "drafting"

    assert await process_next_draft(db, DemoProvider()) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"


@pytest.mark.asyncio
async def test_invalid_ai_output_marks_failed(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "新房装修")
    await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"background": "背景"},
    )

    assert await process_next_draft(db, TooDeepProvider()) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "failed"
    assert "超过 6 层" in (body["last_error"] or "")


@pytest.mark.asyncio
async def test_chat_discussion_keeps_tree(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]
    node_count = len(ctx["draft"]["nodes"])

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/messages",
        json={"content": "我们讨论一下目录这样划分是否合理？"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["draft"]["status"] == "pending_confirm"
    assert len(body["draft"]["nodes"]) == node_count
    assert any(
        message["role"] == "assistant" and "讨论" in message["content"]
        for message in body["messages"]
    )
    assert not any(
        message["role"] == "system" and "已应用目录" in message["content"]
        for message in body["messages"]
    )


@pytest.mark.asyncio
async def test_chat_apply_updates_tree(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]
    node_count = len(ctx["draft"]["nodes"])

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/messages",
        json={"content": "增加一个收纳节点"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    names = [node["name"] for node in body["draft"]["nodes"]]
    assert "收纳节点" in names
    assert len(body["draft"]["nodes"]) == node_count + 1
    assert any(
        message["role"] == "system"
        and message["content"].startswith("已应用目录，共 ")
        for message in body["messages"]
    )


@pytest.mark.asyncio
async def test_chat_self_heals_duplicate_then_applies(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/messages",
        json={"content": "请先提交一版含同级重名的目录再修正"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["draft"]["status"] == "pending_confirm"
    assert any(
        message["role"] == "system" and "重名节点" in message["content"]
        for message in body["messages"]
    )
    assert any(
        message["role"] == "system" and message["content"].startswith("已应用目录")
        for message in body["messages"]
    )


@pytest.mark.asyncio
async def test_chat_gives_up_after_bounded_retries(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]
    node_count = len(ctx["draft"]["nodes"])

    async with db.begin():
        project = await db.scalar(
            select(Project).where(Project.id == project_id)
        )
        provider = AlwaysInvalidChatProvider()
        await submit_draft_message(
            db,
            project.workspace_id,
            project_id,
            draft_id,
            "应用目录",
            provider,
        )

    body = (await client.get(f"/api/projects/{project_id}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    assert len(body["nodes"]) == node_count
    feedback = [
        message["content"]
        for message in body["messages"]
        if message["role"] == "system" and "未应用变更" in message["content"]
    ]
    assert len(feedback) == 3
    assert any("已停止自动重试" in message["content"] for message in body["messages"])


@pytest.mark.asyncio
async def test_chat_failure_persists_round_and_feedback(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]
    node_count = len(ctx["draft"]["nodes"])

    async with db.begin():
        project = await db.scalar(
            select(Project).where(Project.id == project_id)
        )
        await submit_draft_message(
            db,
            project.workspace_id,
            project_id,
            draft_id,
            "同意你的方案，请应用",
            FailingChatProvider(),
        )

    body = (await client.get(f"/api/projects/{project_id}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    assert len(body["nodes"]) == node_count
    assert any(
        message["role"] == "user" and message["content"] == "同意你的方案，请应用"
        for message in body["messages"]
    )
    assert any(
        message["role"] == "system" and "未应用变更" in message["content"]
        for message in body["messages"]
    )
    draft = await db.scalar(
        select(DirectoryDraft).where(DirectoryDraft.id == draft_id)
    )
    assert draft.conversation_rounds == 1


@pytest.mark.asyncio
async def test_chat_injects_latest_tree_with_manual_edits(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]
    target = next(
        node for node in ctx["draft"]["nodes"] if node["name"] == "硬装施工模块"
    )

    response = await client.patch(
        f"/api/projects/{project_id}/drafts/{draft_id}/nodes/{target['id']}",
        json={"name": "硬装施工"},
    )
    assert response.status_code == 200

    async with db.begin():
        project = await db.scalar(
            select(Project).where(Project.id == project_id)
        )
        provider = RecordingChatProvider()
        await submit_draft_message(
            db,
            project.workspace_id,
            project_id,
            draft_id,
            "增加一个收纳节点",
            provider,
        )

    assert provider.seen_trees
    injected = provider.seen_trees[0]
    names = [node["name"] for node in injected]
    assert "硬装施工" in names
    assert "硬装施工模块" not in names


@pytest.mark.asyncio
async def test_redraft_clears_conversation(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/messages",
        json={"content": "增加一个收纳节点"},
    )
    assert response.status_code == 200
    assert len(response.json()["messages"]) >= 3

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/redraft",
        json={"background": "重新起草"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "drafting"
    body = (await client.get(f"/api/projects/{project_id}/drafts")).json()["draft"]
    assert body["messages"] == []


@pytest.mark.asyncio
async def test_chat_history_compression_to_intent_note(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    for index in range(11):
        response = await client.post(
            f"/api/projects/{project_id}/drafts/{draft_id}/messages",
            json={"content": f"第 {index + 1} 条消息"},
        )
        assert response.status_code == 200, response.text

    body = (await client.get(f"/api/projects/{project_id}/drafts")).json()["draft"]
    assert body["intent_note"]
    first_remaining = await db.scalar(
        select(func.count(DirectoryDraftMessage.id)).where(
            DirectoryDraftMessage.draft_id == draft_id,
            DirectoryDraftMessage.content == "第 1 条消息",
        )
    )
    assert first_remaining == 0
    assert any(
        message["content"] == "第 11 条消息"
        for message in body["messages"]
    )


@pytest.mark.asyncio
async def test_chat_conversation_round_cap(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    for _ in range(30):
        response = await client.post(
            f"/api/projects/{project_id}/drafts/{draft_id}/messages",
            json={"content": "增加一个节点"},
        )
        assert response.status_code == 200, response.text

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/messages",
        json={"content": "再加一个节点"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "draft_conversation_limit"


@pytest.mark.asyncio
async def test_chat_hides_other_workspace_conversation(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    async with db.begin():
        await create_account(db, "draft_other", "other password")
    login_response = await client.post(
        "/api/auth/login",
        json={"account": "draft_other", "password": "other password"},
    )
    assert login_response.status_code == 200

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/messages",
        json={"content": "增加一个节点"},
    )
    assert response.status_code == 404
    response = await client.get(f"/api/projects/{project_id}/drafts")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_chat_rejected_after_confirm(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/confirm",
    )
    assert response.status_code == 200

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/messages",
        json={"content": "还能改吗"},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "draft_not_confirmable"


@pytest.mark.asyncio
async def test_edit_and_delete_draft_node(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]
    target = next(
        node for node in ctx["draft"]["nodes"] if node["name"] == "灯光与氛围"
    )

    response = await client.patch(
        f"/api/projects/{project_id}/drafts/{draft_id}/nodes/{target['id']}",
        json={"name": "灯光氛围与智能"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "灯光氛围与智能"

    response = await client.delete(
        f"/api/projects/{project_id}/drafts/{draft_id}/nodes/{target['id']}",
    )
    assert response.status_code == 200
    names = [node["name"] for node in response.json()["nodes"]]
    assert "灯光氛围与智能" not in names


@pytest.mark.asyncio
async def test_confirm_creates_nodes_and_is_idempotent(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/confirm",
    )
    assert response.status_code == 200, response.text
    created_count = response.json()["created_count"]
    assert created_count > 0

    nodes = (await client.get(f"/api/projects/{project_id}/nodes")).json()
    assert len(nodes) == created_count
    by_name = {node["name"]: node for node in nodes}
    assert by_name["水电改造"]["parent_id"] == by_name["硬装施工模块"]["id"]
    assert by_name["瓦工与防水"]["parent_id"] == by_name["硬装施工模块"]["id"]
    assert by_name["冰箱"]["parent_id"] == by_name["家具家电"]["id"]
    assert by_name["硬装施工模块"]["parent_id"] is None
    assert (await client.get(f"/api/projects/{project_id}/drafts")).json()[
        "draft"
    ] is None

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/confirm",
    )
    assert response.status_code == 200
    assert response.json()["created_count"] == 0


@pytest.mark.asyncio
async def test_confirm_rejects_empty_selection(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    for node in ctx["draft"]["nodes"]:
        response = await client.patch(
            f"/api/projects/{project_id}/drafts/{draft_id}/nodes/{node['id']}",
            json={"selected": False},
        )
        assert response.status_code == 200

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/confirm",
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "draft_empty_selection"


@pytest.mark.asyncio
async def test_manual_node_create_discards_active_draft(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]

    response = await client.post(
        f"/api/projects/{project_id}/nodes",
        json={"name": "手动创建"},
    )
    assert response.status_code == 201
    assert (await client.get(f"/api/projects/{project_id}/drafts")).json()[
        "draft"
    ] is None
    nodes = (await client.get(f"/api/projects/{project_id}/nodes")).json()
    assert any(node["name"] == "手动创建" for node in nodes)


@pytest.mark.asyncio
async def test_other_workspace_cannot_see_draft(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    async with db.begin():
        await create_account(db, "other", "other password")
    project = await create_project(client, "新房装修")
    await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"background": "背景"},
    )

    login_response = await client.post(
        "/api/auth/login",
        json={"account": "other", "password": "other password"},
    )
    assert login_response.status_code == 200
    response = await client.get(f"/api/projects/{project['id']}/drafts")
    assert response.status_code == 404


class _FakeMessage:
    def __init__(
        self,
        content: str | None = None,
        tool_calls: list | None = None,
    ) -> None:
        self.content = content
        self.tool_calls = tool_calls or []


class _FakeChoice:
    def __init__(self, message: _FakeMessage) -> None:
        self.message = message


class _FakeResponse:
    def __init__(self, message: _FakeMessage) -> None:
        self.choices = [_FakeChoice(message)]


class _FakeFunction:
    def __init__(self, name: str, arguments: str) -> None:
        self.name = name
        self.arguments = arguments


class _FakeToolCall:
    def __init__(self, function: _FakeFunction) -> None:
        self.function = function


class _FakeChatCompletions:
    def __init__(self, response: _FakeResponse) -> None:
        self._response = response

    async def create(self, **kwargs: object) -> _FakeResponse:
        return self._response


class _FakeClient:
    def __init__(self, response: _FakeResponse) -> None:
        self.chat = SimpleNamespace(
            completions=_FakeChatCompletions(response)
        )


class _FlakyChatCompletions:
    def __init__(self, response: _FakeResponse, failures: int) -> None:
        self._response = response
        self._failures = failures

    async def create(self, **kwargs: object) -> _FakeResponse:
        if self._failures > 0:
            self._failures -= 1
            raise APIConnectionError(
                request=httpx.Request(
                    "POST",
                    "https://api.deepseek.com/chat/completions",
                )
            )
        return self._response


class _FlakyClient:
    def __init__(self, response: _FakeResponse, failures: int) -> None:
        self.chat = SimpleNamespace(
            completions=_FlakyChatCompletions(response, failures)
        )


@pytest.mark.asyncio
async def test_request_chat_round_parses_tool_call() -> None:
    response = _FakeResponse(
        _FakeMessage(
            content="",
            tool_calls=[
                _FakeToolCall(
                    _FakeFunction(
                        "apply_directory_tree",
                        '{"nodes": [{"name": "A", "children": [{"name": "B"}]}]}',
                    )
                )
            ],
        )
    )
    result = await request_chat_round(
        _FakeClient(response),
        "model",
        [],
        [{"role": "user", "content": "请应用目录"}],
    )
    assert result.tree == [{"name": "A", "children": [{"name": "B"}]}]
    assert result.reply_text == "（已提交目录树）"


@pytest.mark.asyncio
async def test_request_chat_round_fallback_marker_block() -> None:
    response = _FakeResponse(
        _FakeMessage(
            content='```directory-tree\n{"nodes": [{"name": "A"}]}\n```',
            tool_calls=[],
        )
    )
    result = await request_chat_round(
        _FakeClient(response),
        "model",
        [],
        [{"role": "user", "content": "请应用目录"}],
    )
    assert result.tree == [{"name": "A"}]


@pytest.mark.asyncio
async def test_request_chat_round_pure_discussion() -> None:
    response = _FakeResponse(
        _FakeMessage(content="可以，我们先讨论一下粒度。", tool_calls=[])
    )
    result = await request_chat_round(
        _FakeClient(response),
        "model",
        [],
        [{"role": "user", "content": "讨论一下"}],
    )
    assert result.tree is None
    assert result.reply_text == "可以，我们先讨论一下粒度。"


@pytest.mark.asyncio
async def test_request_chat_round_rejects_invalid_tool_json() -> None:
    response = _FakeResponse(
        _FakeMessage(
            content="",
            tool_calls=[
                _FakeToolCall(
                    _FakeFunction("apply_directory_tree", "not json")
                )
            ],
        )
    )
    with pytest.raises(AIProviderError):
        await request_chat_round(
            _FakeClient(response),
            "model",
            [],
            [{"role": "user", "content": "请应用目录"}],
        )


@pytest.mark.asyncio
async def test_request_chat_round_retries_connection_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.ai.openai_compat.CHAT_RETRY_DELAYS", (0.0, 0.0))
    response = _FakeResponse(
        _FakeMessage(content="可以，我们先讨论一下。", tool_calls=[])
    )
    result = await request_chat_round(
        _FlakyClient(response, failures=2),
        "model",
        [],
        [{"role": "user", "content": "讨论一下"}],
    )
    assert result.tree is None
    assert result.reply_text == "可以，我们先讨论一下。"


@pytest.mark.asyncio
async def test_request_chat_round_gives_up_after_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.ai.openai_compat.CHAT_RETRY_DELAYS", (0.0, 0.0))
    response = _FakeResponse(_FakeMessage(content="", tool_calls=[]))
    with pytest.raises(AIProviderError):
        await request_chat_round(
            _FlakyClient(response, failures=99),
            "model",
            [],
            [{"role": "user", "content": "讨论一下"}],
        )
