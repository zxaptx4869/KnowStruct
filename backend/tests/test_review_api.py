from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Entry,
    EntrySource,
    Extraction,
    ExtractionStatus,
    Project,
    ReviewResolution,
    Source,
)
from app.services.accounts import create_account
from app.services.review import utc_now
from tests.test_inbox_api import capture, create_project, login_owner
from tests.test_node_entries import _accepted_entry, _create_node


async def _seed_long_pending(
    db: AsyncSession,
    workspace_id: str,
    source_id: str,
    count: int = 2,
    days: int = 8,
) -> None:
    for index in range(count):
        db.add(
            Extraction(
                source_id=source_id,
                workspace_id=workspace_id,
                status=ExtractionStatus.PENDING_CONFIRM.value,
                title=f"待确认候选 {index + 1}",
                content="需要确认的经验内容",
                entry_type="experience",
                applicable_conditions=[],
                confidence=0.8,
                created_at=utc_now() - timedelta(days=days),
            )
        )
    await db.commit()


async def _seed_other_workspace_problems(db: AsyncSession, workspace_id: str) -> None:
    project = Project(workspace_id=workspace_id, name="其他工作区项目")
    db.add(project)
    await db.flush()
    db.add(
        Entry(
            workspace_id=workspace_id,
            project_id=project.id,
            entry_type="experience",
            title="其他工作区的记录",
            content="不应被看到",
            applicable_conditions=[],
        )
    )
    source = Source(
        workspace_id=workspace_id,
        source_type="text",
        title="其他工作区的来源",
        content="待确认内容",
    )
    db.add(source)
    await db.flush()
    db.add(
        Extraction(
            source_id=source.id,
            workspace_id=workspace_id,
            status=ExtractionStatus.PENDING_CONFIRM.value,
            title="其他工作区候选",
            content="待确认",
            entry_type="experience",
            applicable_conditions=[],
            confidence=0.7,
            created_at=utc_now() - timedelta(days=10),
        )
    )
    await db.commit()


@pytest.mark.asyncio
async def test_open_findings_for_all_three_types(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner_workspace_id = await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")

    missing_conditions_entry, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
        conditions=[],
    )
    missing_source_entry, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
        conditions=["底部散热"],
    )
    await db.execute(
        delete(EntrySource).where(EntrySource.entry_id == missing_source_entry)
    )
    await db.commit()

    source = await capture(
        client,
        source_type="text",
        content="  吊顶材料待确认  ",
    )
    await _seed_long_pending(
        db,
        owner_workspace_id,
        source["id"],
        count=2,
    )

    body = (await client.get("/api/review/findings")).json()
    findings = body["findings"]
    by_target = {
        (item["finding_type"], item["target_id"]): item for item in findings
    }

    missing_conditions = by_target[
        ("missing_conditions", missing_conditions_entry)
    ]
    assert missing_conditions["title"] == "散热方式决定侧边预留"
    assert missing_conditions["conditions"] == []
    assert missing_conditions["node_path"] == ["冰箱"]

    missing_source = by_target[("missing_source", missing_source_entry)]
    assert missing_source["summary"].startswith("该记录没有任何来源关联")
    assert missing_source["content"].startswith("零嵌冰箱")

    long_pending = by_target[("long_pending", source["id"])]
    assert long_pending["pending_count"] == 2
    assert "2 条候选待确认" in long_pending["summary"]
    assert long_pending["target_type"] == "source"


@pytest.mark.asyncio
async def test_empty_findings_and_type_filter(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    assert (await client.get("/api/review/findings")).json()["findings"] == []

    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
        conditions=[],
    )
    open_body = (await client.get("/api/review/findings")).json()
    assert [item["finding_type"] for item in open_body["findings"]] == [
        "missing_conditions"
    ]
    filtered = (
        await client.get(
            "/api/review/findings",
            params={"type": "missing_conditions"},
        )
    ).json()
    assert len(filtered["findings"]) == 1
    other = (
        await client.get(
            "/api/review/findings",
            params={"type": "long_pending"},
        )
    ).json()
    assert other["findings"] == []


@pytest.mark.asyncio
async def test_resolve_ignore_undo_and_idempotency(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_id, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
        conditions=[],
    )
    path = f"/api/review/findings/missing_conditions/entry/{entry_id}/resolution"

    response = await client.post(path, json={"resolution": "resolved", "note": "已补条件"})
    assert response.status_code == 200
    assert (await client.get("/api/review/findings")).json()["findings"] == []

    resolved = (
        await client.get("/api/review/findings", params={"status": "resolved"})
    ).json()["findings"]
    assert len(resolved) == 1
    assert resolved[0]["resolution"] == "resolved"
    assert resolved[0]["note"] == "已补条件"
    assert resolved[0]["resolved_at"] is not None
    assert resolved[0]["target_id"] == entry_id

    # 幂等：重复提交不产生第二条记录
    await client.post(path, json={"resolution": "resolved", "note": "已补条件"})
    count = await db.scalar(
        select(func.count(ReviewResolution.id)).where(
            ReviewResolution.target_id == entry_id
        )
    )
    assert count == 1

    # 撤销后回到待处理
    response = await client.delete(path)
    assert response.json() == {"removed": True}
    open_findings = (await client.get("/api/review/findings")).json()["findings"]
    assert any(item["target_id"] == entry_id for item in open_findings)

    # 重复撤销幂等
    response = await client.delete(path)
    assert response.json() == {"removed": False}

    # 忽略
    await client.post(path, json={"resolution": "ignored"})
    ignored = (
        await client.get("/api/review/findings", params={"status": "resolved"})
    ).json()["findings"]
    assert ignored[0]["resolution"] == "ignored"


@pytest.mark.asyncio
async def test_workspace_isolation(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_id, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
        conditions=[],
    )

    async with db.begin():
        other_user = await create_account(db, "other", "another password 123")
        other_workspace_id = other_user.workspace.id
    await _seed_other_workspace_problems(db, other_workspace_id)

    own = (await client.get("/api/review/findings")).json()["findings"]
    assert len(own) == 1
    assert own[0]["target_id"] == entry_id
    assert not any(
        item["title"] == "其他工作区的记录" or item["title"] == "其他工作区的来源"
        for item in own
    )

    # 处理只影响本工作区
    path = f"/api/review/findings/missing_conditions/entry/{entry_id}/resolution"
    await client.post(path, json={"resolution": "resolved"})
    other_body = (
        await client.get(
            "/api/review/findings",
            params={"status": "resolved"},
        )
    ).json()
    assert len(other_body["findings"]) == 1

    # 跨工作区目标按不存在处理
    other_source = await db.scalar(
        select(Source).where(
            Source.workspace_id == other_workspace_id,
            Source.title == "其他工作区的来源",
        )
    )
    assert other_source is not None
    response = await client.post(
        f"/api/review/findings/long_pending/source/{other_source.id}/resolution",
        json={"resolution": "resolved"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_invalid_parameters_and_resolution_input(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    assert (
        await client.get("/api/review/findings", params={"status": "done"})
    ).status_code == 422
    assert (
        await client.get("/api/review/findings", params={"type": "unknown"})
    ).status_code == 422
    response = await client.post(
        "/api/review/findings/missing_conditions/entry/nope/resolution",
        json={"resolution": "resolved"},
    )
    assert response.status_code == 404
    response = await client.post(
        "/api/review/findings/missing_conditions/entry/nope/resolution",
        json={"resolution": "maybe"},
    )
    assert response.status_code == 422
    response = await client.post(
        "/api/review/findings/unknown/entry/nope/resolution",
        json={"resolution": "resolved"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_resolved_view_keeps_record_after_target_deleted(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_id, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
        conditions=[],
    )
    path = f"/api/review/findings/missing_conditions/entry/{entry_id}/resolution"
    await client.post(path, json={"resolution": "resolved", "note": "不再需要"})

    response = await client.delete(f"/api/projects/{project['id']}/entries/{entry_id}")
    assert response.status_code == 204

    resolved = (
        await client.get("/api/review/findings", params={"status": "resolved"})
    ).json()["findings"]
    assert len(resolved) == 1
    assert resolved[0]["title"] == "（目标已删除）"
    assert resolved[0]["note"] == "不再需要"
