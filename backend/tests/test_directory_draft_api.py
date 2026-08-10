import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import (
    AIProviderError,
    ClarifyQuestion,
    ClarifyResult,
    OutlineAction,
    OutlineNode,
)
from app.ai.demo import DemoProvider
from app.services.accounts import create_account
from app.services.task_worker import process_next_draft
from tests.test_inbox_api import create_project, login_owner


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
                )
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


class RenameRefineProvider(DemoProvider):
    """先改名再引用旧名路径的演示 Provider，验证快照解析。"""

    async def refine_outline(
        self,
        draft: list[dict],
        intent_note: str,
        instruction: str,
    ) -> list[OutlineAction]:
        return [
            OutlineAction(
                type="rename",
                path=["硬装施工模块"],
                name="硬装施工",
            ),
            OutlineAction(
                type="add",
                path=["硬装施工模块"],
                name="水电补充",
            ),
        ]

    async def summarize_intent(
        self, intent_note: str, instruction: str
    ) -> str:
        return f"{intent_note or ''}；{instruction}".strip("；")[:500]


class UnknownPathRefineProvider(DemoProvider):
    async def refine_outline(
        self,
        draft: list[dict],
        intent_note: str,
        instruction: str,
    ) -> list[OutlineAction]:
        return [OutlineAction(type="remove", path=["不存在的节点"])]


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
    assert len(body["clarify"]) == 1
    assert body["clarify"][0]["options"] == ["设计", "施工", "采购"]

    response = await client.post(
        f"/api/projects/{project['id']}/drafts/{draft_id}/clarify",
        json={"answers": {"q1": "施工"}},
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
async def test_refine_and_intent_note(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    response = await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/refine",
        json={"instruction": "增加一个收纳节点"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "drafting"

    assert await process_next_draft(db, DemoProvider()) is True
    body = (await client.get(f"/api/projects/{project_id}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    names = [node["name"] for node in body["nodes"]]
    assert "新增节点" in names
    assert "增加一个收纳节点" in (body["intent_note"] or "")


@pytest.mark.asyncio
async def test_refine_rename_then_old_path_still_resolves(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/refine",
        json={"instruction": "缩短名称并补充水电"},
    )
    assert await process_next_draft(db, RenameRefineProvider()) is True
    body = (await client.get(f"/api/projects/{project_id}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"

    by_id = {node["id"]: node for node in body["nodes"]}
    renamed = next(
        node for node in body["nodes"] if node["name"] == "硬装施工"
    )
    added = next(node for node in body["nodes"] if node["name"] == "水电补充")
    assert added["parent_id"] == renamed["id"]
    assert "硬装施工模块" not in by_id


@pytest.mark.asyncio
async def test_refine_unknown_path_marks_failed(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/refine",
        json={"instruction": "删除某个节点"},
    )
    assert await process_next_draft(db, UnknownPathRefineProvider()) is True
    body = (await client.get(f"/api/projects/{project_id}/drafts")).json()["draft"]
    assert body["status"] == "failed"
    assert "引用了不存在的节点路径" in (body["last_error"] or "")


@pytest.mark.asyncio
async def test_refine_shorten_names_with_demo_provider(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    ctx = await _create_generated_draft(client, db)
    project_id = ctx["project"]["id"]
    draft_id = ctx["draft_id"]

    await client.post(
        f"/api/projects/{project_id}/drafts/{draft_id}/refine",
        json={"instruction": "把目录名称适当缩短"},
    )
    assert await process_next_draft(db, DemoProvider()) is True
    body = (await client.get(f"/api/projects/{project_id}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    names = [node["name"] for node in body["nodes"]]
    assert "硬装施工" in names
    assert "硬装施工模块" not in names


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
