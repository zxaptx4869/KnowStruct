"""项目概要：签名校验与懒重建测试。"""

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.demo import DemoProvider
from app.models import Node, Project
from app.services.project_summary import (
    generate_project_summary,
    project_structure_signature,
    rebuild_one_stale_summary,
)
from tests.test_inbox_api import create_project, login_owner


@pytest.fixture(autouse=True)
def _demo_provider_for_summary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """概要重建使用确定性 DemoProvider。"""
    import app.ai as ai_module

    async def _fake_provider(db: AsyncSession, workspace_id: str) -> DemoProvider:
        return DemoProvider()

    monkeypatch.setattr(ai_module, "get_ai_provider", _fake_provider)


@pytest.fixture(autouse=True)
async def _clean_projects(db: AsyncSession) -> None:
    """重建逻辑全局扫描项目，测试前清空避免其他用例干扰。"""
    await db.execute(delete(Node))
    await db.execute(delete(Project))
    await db.commit()


async def _project_with_nodes(client: AsyncClient, project_id: str) -> dict:
    root = await client.post(
        f"/api/projects/{project_id}/nodes",
        json={"name": "住宿推荐", "description": "各地住宿"},
    )
    assert root.status_code == 201
    child = await client.post(
        f"/api/projects/{project_id}/nodes",
        json={"name": "昆明住宿", "parent_id": root.json()["id"]},
    )
    assert child.status_code == 201
    return {"root": root.json(), "child": child.json()}


@pytest.mark.asyncio
async def test_signature_changes_on_rename_not_on_reorder(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "概要签名")
    created = await _project_with_nodes(client, project["id"])
    root_id = created["root"]["id"]

    before = await project_structure_signature(db, project["id"])
    assert before is not None

    # 调整排序不改变签名
    moved = await client.post(
        f"/api/projects/{project['id']}/nodes/{root_id}/move",
        json={"parent_id": None, "position": 0},
    )
    assert moved.status_code == 200
    after_reorder = await project_structure_signature(db, project["id"])
    assert after_reorder == before

    # 改名改变签名
    renamed = await client.patch(
        f"/api/projects/{project['id']}/nodes/{root_id}",
        json={"name": "住宿安排"},
    )
    assert renamed.status_code == 200
    after_rename = await project_structure_signature(db, project["id"])
    assert after_rename != before


@pytest.mark.asyncio
async def test_generate_summary_and_rebuild_after_change(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "概要生成")
    created = await _project_with_nodes(client, project["id"])
    project_row = await db.scalar(
        select(Project).where(Project.id == project["id"])
    )
    assert project_row is not None

    assert await generate_project_summary(db, project_row, DemoProvider()) is True
    assert project_row.summary
    assert project_row.summary_signature
    assert project_row.summary_updated_at is not None
    await db.commit()

    # 结构未变时不需要重建
    assert await rebuild_one_stale_summary(db) is False

    # 改名后触发重建
    await client.patch(
        f"/api/projects/{project['id']}/nodes/{created['root']['id']}",
        json={"name": "住宿安排"},
    )
    await db.commit()
    db.expire_all()
    assert await rebuild_one_stale_summary(db) is True
    refreshed = await db.scalar(
        select(Project).where(Project.id == project["id"])
    )
    assert refreshed is not None
    assert "住宿安排" in (refreshed.summary or "")


@pytest.mark.asyncio
async def test_summary_signature_ignores_sort_order_field(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    """签名只反映结构，不反映排序字段本身的变化。"""
    await login_owner(client, db)
    project = await create_project(client, "签名排序")
    root = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "住宿推荐"},
    )
    node = await db.scalar(select(Node).where(Node.id == root.json()["id"]))
    assert node is not None
    node.sort_order = 99
    await db.flush()
    signature = await project_structure_signature(db, project["id"])
    assert signature is not None
