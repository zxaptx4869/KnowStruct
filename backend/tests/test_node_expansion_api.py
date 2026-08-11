"""节点级 AI 拓展（C7）API 测试：生成、差异、确认合并、并发与安全。"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProviderError, OutlineNode
from app.ai.demo import DemoProvider
from app.models import (
    DirectoryDraft,
    DraftStatus,
    Entry,
    EntryStatus,
    EntryType,
    Project,
)
from app.services.task_worker import process_next_draft
from tests.test_directory_draft_api import ClarifyProvider
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


class ExpansionFailingProvider(DemoProvider):
    """首次节点拓展抛错，验证失败与重试。"""

    def __init__(self) -> None:
        super().__init__()
        self._failed = False

    async def expand_node(
        self, node_title: str, context: str = ""
    ) -> list[OutlineNode]:
        if not self._failed:
            self._failed = True
            raise AIProviderError("模拟节点拓展失败")
        return await super().expand_node(node_title, context)


class ExpansionClarifyProvider(ClarifyProvider):
    """始终要求澄清的 Provider：验证节点拓展跳过澄清直接生成。"""

    async def expand_node(
        self, node_title: str, context: str = ""
    ) -> list[OutlineNode]:
        return await super().expand_node(node_title, context)


async def _create_project_with_target(
    client: AsyncClient,
    db: AsyncSession,
    *,
    children: list[str],
) -> tuple[dict, dict]:
    """创建项目与目标节点（含子节点），返回 (project, target_node)。"""
    await login_owner(client, db)
    project = await create_project(client, "节点拓展验收")
    response = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "装修准备", "description": "前期准备"},
    )
    assert response.status_code == 201
    target = response.json()
    for name in children:
        created = await client.post(
            f"/api/projects/{project['id']}/nodes",
            json={"name": name, "parent_id": target["id"]},
        )
        assert created.status_code == 201
    return project, target


def _diff_kinds(diff: list[dict]) -> dict[str, list[str]]:
    kinds: dict[str, list[str]] = {}
    for entry in diff:
        label = entry.get("name") or (entry.get("node") or {}).get("name")
        kinds.setdefault(entry["kind"], []).append(label)
        for child in entry.get("children", []):
            child_entry = {
                "kind": child["kind"],
                "name": child.get("name") or (child.get("node") or {}).get("name"),
                "children": child.get("children", []),
            }
            kinds.setdefault(child_entry["kind"], []).append(child_entry["name"])
    return kinds


@pytest.mark.asyncio
async def test_expansion_generate_diff_and_confirm(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project, target = await _create_project_with_target(
        client,
        db,
        children=["风格确定", "预算范围"],
    )

    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={
            "background": "装修前期准备",
            "target_node_id": target["id"],
        },
    )
    assert response.status_code == 201
    draft_id = response.json()["id"]
    assert response.json()["target_node_id"] == target["id"]

    assert await process_next_draft(db, DemoProvider()) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    assert body["target_node_id"] == target["id"]
    kinds = _diff_kinds(body["diff"])
    assert "风格确定" in kinds.get("kept", [])
    assert "预算范围" in kinds.get("kept", [])
    assert "新增细分节点" in kinds.get("added", [])
    assert "removed" not in kinds

    confirm = await client.post(
        f"/api/projects/{project['id']}/drafts/{draft_id}/confirm",
        json={"removed_node_ids": []},
    )
    assert confirm.status_code == 200
    assert confirm.json()["created_count"] == 1
    assert confirm.json()["status"] == "confirmed"

    nodes = (
        await client.get(f"/api/projects/{project['id']}/nodes")
    ).json()
    children = [
        node["name"]
        for node in nodes
        if node["parent_id"] == target["id"]
    ]
    assert children == ["风格确定", "预算范围", "新增细分节点"]


@pytest.mark.asyncio
async def test_expansion_removed_marked_and_blocked_by_entries(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project, target = await _create_project_with_target(
        client,
        db,
        children=["待删除节点", "保留节点"],
    )
    removed_node = (
        await client.get(f"/api/projects/{project['id']}/nodes")
    ).json()
    removed_node = next(
        node for node in removed_node if node["name"] == "待删除节点"
    )

    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": target["id"]},
    )
    assert response.status_code == 201
    draft_id = response.json()["id"]
    assert await process_next_draft(db, DemoProvider()) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    kinds = _diff_kinds(body["diff"])
    assert "待删除节点" in kinds.get("removed", [])
    assert "保留节点" in kinds.get("kept", [])

    # 给待删除节点写入受保护 Entry 引用 → 移除被阻断
    project_row = await db.scalar(
        select(Project).where(Project.id == project["id"])
    )
    assert project_row is not None
    db.add(
        Entry(
            workspace_id=project_row.workspace_id,
            project_id=project["id"],
            node_id=removed_node["id"],
            entry_type=EntryType.EXPERIENCE.value,
            title="受保护记录",
            content="内容",
            status=EntryStatus.ARCHIVED.value,
        )
    )
    await db.commit()

    refreshed = (
        await client.get(f"/api/projects/{project['id']}/drafts")
    ).json()["draft"]
    removed_entry = next(
        entry
        for entry in refreshed["diff"]
        if entry["kind"] == "removed"
        and entry.get("name") == "待删除节点"
    )
    assert removed_entry["blocked"] is True
    assert removed_entry["blocker_count"] >= 1

    confirm = await client.post(
        f"/api/projects/{project['id']}/drafts/{draft_id}/confirm",
        json={"removed_node_ids": [removed_node["id"]]},
    )
    assert confirm.status_code == 409
    assert confirm.json()["detail"]["code"] == "node_has_protected_content"

    after = (
        await client.get(f"/api/projects/{project['id']}/drafts")
    ).json()["draft"]
    assert after["status"] == "pending_confirm"


@pytest.mark.asyncio
async def test_expansion_confirm_removes_selected_node(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project, target = await _create_project_with_target(
        client,
        db,
        children=["待删除节点", "保留节点"],
    )
    nodes = (await client.get(f"/api/projects/{project['id']}/nodes")).json()
    removed_node = next(
        node for node in nodes if node["name"] == "待删除节点"
    )

    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": target["id"]},
    )
    draft_id = response.json()["id"]
    assert await process_next_draft(db, DemoProvider()) is True

    confirm = await client.post(
        f"/api/projects/{project['id']}/drafts/{draft_id}/confirm",
        json={"removed_node_ids": [removed_node["id"]]},
    )
    assert confirm.status_code == 200

    nodes = (await client.get(f"/api/projects/{project['id']}/nodes")).json()
    names = [node["name"] for node in nodes]
    assert "待删除节点" not in names
    assert "保留节点" in names
    assert "新增细分节点" in names


@pytest.mark.asyncio
async def test_expansion_rejects_invalid_removal_target(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project, target = await _create_project_with_target(
        client,
        db,
        children=["保留节点"],
    )
    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": target["id"]},
    )
    draft_id = response.json()["id"]
    assert await process_next_draft(db, DemoProvider()) is True

    confirm = await client.post(
        f"/api/projects/{project['id']}/drafts/{draft_id}/confirm",
        json={"removed_node_ids": [target["id"]]},
    )
    assert confirm.status_code == 409
    assert confirm.json()["detail"]["code"] == "invalid_removal_target"


@pytest.mark.asyncio
async def test_expansion_requires_existing_node(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "节点拓展验收")
    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_expansion_shares_single_active_draft_slot(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project, target = await _create_project_with_target(
        client,
        db,
        children=["保留节点"],
    )
    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": target["id"]},
    )
    assert response.status_code == 201

    second = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": target["id"]},
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "draft_already_active"

    project_draft = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={},
    )
    assert project_draft.status_code == 409
    assert project_draft.json()["detail"]["code"] == "draft_requires_empty_project"


@pytest.mark.asyncio
async def test_expansion_target_deleted_discards_draft(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project, target = await _create_project_with_target(
        client,
        db,
        children=["保留节点"],
    )
    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": target["id"]},
    )
    draft_id = response.json()["id"]
    assert await process_next_draft(db, DemoProvider()) is True

    deleted = await client.delete(
        f"/api/projects/{project['id']}/nodes/{target['id']}"
    )
    assert deleted.status_code == 200

    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()
    assert body["draft"] is None
    draft = await db.scalar(
        select(DirectoryDraft).where(DirectoryDraft.id == draft_id)
    )
    assert draft is not None
    assert draft.status == DraftStatus.DISCARDED


@pytest.mark.asyncio
async def test_expansion_failed_generation_retry(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project, target = await _create_project_with_target(
        client,
        db,
        children=["保留节点"],
    )
    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": target["id"]},
    )
    draft_id = response.json()["id"]
    provider = ExpansionFailingProvider()

    assert await process_next_draft(db, provider) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "failed"
    assert "模拟节点拓展失败" in (body["last_error"] or "")

    retry = await client.post(
        f"/api/projects/{project['id']}/drafts/{draft_id}/retry",
    )
    assert retry.status_code == 200
    assert retry.json()["status"] == "drafting"
    assert await process_next_draft(db, provider) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    assert "新增细分节点" in [
        node["name"]
        for node in body["nodes"]
        if node["parent_id"] is None
    ]


@pytest.mark.asyncio
async def test_expansion_skips_clarification(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    """节点拓展不应进入澄清步骤，即使 Provider 倾向澄清。"""
    project, target = await _create_project_with_target(
        client,
        db,
        children=["保留节点"],
    )
    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": target["id"]},
    )
    assert response.status_code == 201

    assert await process_next_draft(db, ExpansionClarifyProvider()) is True
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    assert body["clarify"] == []


@pytest.mark.asyncio
async def test_expansion_confirm_rejects_depth_exceeded(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    """目标节点位于第 6 层时，AI 新增子节点必须被深度校验拒绝。"""
    await login_owner(client, db)
    project = await create_project(client, "深度校验")
    parent_id: str | None = None
    target_id = ""
    for index in range(6):
        response = await client.post(
            f"/api/projects/{project['id']}/nodes",
            json={"name": f"层{index + 1}", "parent_id": parent_id},
        )
        assert response.status_code == 201
        target_id = response.json()["id"]
        parent_id = target_id

    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": target_id},
    )
    assert response.status_code == 201
    draft_id = response.json()["id"]
    assert await process_next_draft(db, DemoProvider()) is True

    confirm = await client.post(
        f"/api/projects/{project['id']}/drafts/{draft_id}/confirm",
        json={"removed_node_ids": []},
    )
    assert confirm.status_code == 409
    assert confirm.json()["detail"]["code"] == "node_depth_exceeded"
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"


@pytest.mark.asyncio
async def test_expansion_conversation_keeps_target(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project, target = await _create_project_with_target(
        client,
        db,
        children=["保留节点"],
    )
    response = await client.post(
        f"/api/projects/{project['id']}/drafts",
        json={"target_node_id": target["id"]},
    )
    draft_id = response.json()["id"]
    assert await process_next_draft(db, DemoProvider()) is True

    message = await client.post(
        f"/api/projects/{project['id']}/drafts/{draft_id}/messages",
        json={"content": "再添加一个收纳节点"},
    )
    assert message.status_code == 200
    body = (await client.get(f"/api/projects/{project['id']}/drafts")).json()["draft"]
    assert body["status"] == "pending_confirm"
    assert body["target_node_id"] == target["id"]
    assert any(
        msg["content"].startswith("已应用目录")
        for msg in body["messages"]
    )
    assert "收纳节点" in [
        node["name"]
        for node in body["nodes"]
        if node["parent_id"] is None
    ]
