"""AI 归档建议（项目推荐 + 目录感知提取）测试。"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import ProjectRecommendation
from app.ai.demo import DemoProvider
from app.models import Source
from app.services.task_worker import process_next_task
from tests.fakes import FakeAIProvider, make_candidate
from tests.test_inbox_api import capture, create_project, login_owner


@pytest.fixture(autouse=True)
def _demo_provider_for_capture(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """采集同步推荐使用确定性 DemoProvider。"""
    import app.ai as ai_module

    async def _fake_provider(db: AsyncSession, workspace_id: str) -> DemoProvider:
        return DemoProvider()

    monkeypatch.setattr(ai_module, "get_ai_provider", _fake_provider)


@pytest.mark.asyncio
async def test_recommend_project_on_capture(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "房子装修")
    await create_project(client, "新疆旅游")

    source = await capture(
        client,
        source_type="text",
        content="房子装修的主材清单：瓷砖、地板与涂料选择",
    )
    assert source["recommended_project_id"] == project["id"]
    assert source["recommended_project_name"] == "房子装修"
    assert source["recommended_confidence"] == 0.9
    assert source["recommended_reason"]
    assert source["project_id"] == project["id"]


@pytest.mark.asyncio
async def test_recommend_single_project_without_model_call(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "房子装修")

    source = await capture(
        client,
        source_type="text",
        content="瓷砖选择经验",
    )
    assert source["recommended_project_id"] == project["id"]
    assert source["recommended_confidence"] == 1.0
    assert source["project_id"] == project["id"]


@pytest.mark.asyncio
async def test_low_confidence_no_recommendation(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    await create_project(client, "房子装修")
    await create_project(client, "新疆旅游")

    source = await capture(
        client,
        source_type="text",
        content="与任何项目主题都无关的日常记录",
    )
    assert source["recommended_project_id"] is None
    assert source["recommended_confidence"] is None
    assert source["project_id"] is None


@pytest.mark.asyncio
async def test_directory_injected_into_extraction(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "房子装修")
    root = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "家具家电", "description": "大家电与家具选购"},
    )
    assert root.status_code == 201
    child = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "冰箱", "parent_id": root.json()["id"]},
    )
    assert child.status_code == 201

    source = await capture(
        client,
        source_type="text",
        content="零嵌冰箱散热",
        project_id=project["id"],
    )
    provider = FakeAIProvider()
    assert await process_next_task(db, provider) is True

    assert len(provider.calls) == 1
    _, _, directory_paths = provider.calls[0]
    assert directory_paths is not None
    assert "家具家电 / 冰箱" in directory_paths
    assert "家具家电：大家电与家具选购" in directory_paths

    stored = await db.scalar(select(Source).where(Source.id == source["id"]))
    assert stored is not None
    assert stored.project_id == project["id"]


@pytest.mark.asyncio
async def test_directory_paths_include_node_descriptions(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "目录说明")
    root = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "家具家电", "description": "大家电与家具选购"},
    )
    assert root.status_code == 201

    await capture(
        client,
        source_type="text",
        content="零嵌冰箱散热",
        project_id=project["id"],
    )
    provider = FakeAIProvider()
    assert await process_next_task(db, provider) is True
    _, _, directory_paths = provider.calls[0]
    assert directory_paths is not None
    assert "家具家电：大家电与家具选购" in directory_paths


@pytest.mark.asyncio
async def test_suggested_path_prefix_is_stripped_on_store(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    """落库时剥离「建议新建：」前缀，避免节点名或展示混入提示语。"""
    from app.models import Extraction

    await login_owner(client, db)
    source = await capture(
        client,
        source_type="text",
        content="软装窗帘经验",
    )
    provider = FakeAIProvider(
        candidates=[
            make_candidate(
                suggested_node_path="建议新建：软装 / 窗帘",
            )
        ]
    )
    assert await process_next_task(db, provider) is True
    stored = await db.scalar(
        select(Extraction).where(Extraction.source_id == source["id"])
    )
    assert stored is not None
    assert stored.suggested_node_path == "软装 / 窗帘"


@pytest.mark.asyncio
async def test_invalid_recommended_project_id_is_ignored(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    """AI 返回不存在的 project_id 时不得采用，采集仍成功且不分配。"""
    from app.services.inbox import recommend_source_project

    await login_owner(client, db)
    await create_project(client, "房子装修")
    await create_project(client, "新疆旅游")

    class FakeRecommender(DemoProvider):
        async def recommend_project(self, projects, content):
            return ProjectRecommendation(
                project_id="00000000-0000-0000-0000-000000000000",
                confidence=0.9,
                reason="幻觉 id",
            )

    source = await capture(
        client,
        source_type="text",
        content="任意内容",
    )
    stored = await db.scalar(select(Source).where(Source.id == source["id"]))
    assert stored is not None
    assert await recommend_source_project(db, stored, FakeRecommender()) is False
    assert stored.project_id is None
    assert stored.recommended_project_id is None


@pytest.mark.asyncio
async def test_batch_assign_can_override_recommendation(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    """AI 推荐自动填充的 Source 允许批量重新分配；手动分配的拒绝。"""
    await login_owner(client, db)
    project_a = await create_project(client, "房子装修")
    project_b = await create_project(client, "新疆旅游")

    # 推荐自动填充（project_id == recommended_project_id）
    auto = await capture(
        client,
        source_type="text",
        content="房子装修主材清单",
    )
    assert auto["project_id"] == project_a["id"]

    # 手动分配（无推荐记录）
    manual = await capture(
        client,
        source_type="text",
        content="手动指定内容",
        project_id=project_b["id"],
    )

    assigned = await client.post(
        "/api/inbox/sources/batch/assign",
        json={"source_ids": [auto["id"]], "project_id": project_b["id"]},
    )
    assert assigned.status_code == 200
    assert assigned.json()["assigned"] == 1

    rejected = await client.post(
        "/api/inbox/sources/batch/assign",
        json={"source_ids": [manual["id"]], "project_id": project_a["id"]},
    )
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "source_already_assigned"
