from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Entry
from app.services.accounts import create_account
from app.services.task_worker import process_next_task
from tests.fakes import FakeAIProvider
from tests.test_inbox_api import capture, create_project, login_owner


def _naive_utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def _accepted_entry(
    client: AsyncClient,
    db: AsyncSession,
    *,
    project_id: str,
    node_id: str | None = None,
    title: str = "散热方式决定侧边预留",
    content: str = "零嵌冰箱需要先确认散热方式，再决定柜体预留尺寸。",
    conditions: list[str] | None = None,
) -> tuple[str, str]:
    source = await capture(client, source_type="text", content=content)
    await process_next_task(db, FakeAIProvider())
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    extraction = detail["extractions"][0]
    response = await client.post(
        f"/api/inbox/sources/{source['id']}/extractions/{extraction['id']}/decide",
        json={
            "decision": "accepted",
            "project_id": project_id,
            "node_id": node_id,
            "title": title,
            "content": content,
            "entry_type": "pitfall",
            "applicable_conditions": conditions,
        },
    )
    assert response.status_code == 200
    return response.json()["entry"]["id"], source["id"]


async def _create_node(client: AsyncClient, project_id: str, name: str, parent_id: str | None = None) -> dict:
    response = await client.post(
        f"/api/projects/{project_id}/nodes",
        json={"name": name, "parent_id": parent_id},
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_node_entries_list_with_sources_and_conditions(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    parent = await _create_node(client, project["id"], "家具家电")
    child = await _create_node(client, project["id"], "冰箱", parent["id"])
    entry_id, source_id = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=child["id"],
        conditions=["底部散热型号；以安装图为准"],
    )

    response = await client.get(
        f"/api/projects/{project['id']}/nodes/{child['id']}/entries"
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == entry_id
    assert body[0]["entry_type"] == "pitfall"
    assert body[0]["title"] == "散热方式决定侧边预留"
    assert body[0]["applicable_conditions"] == ["底部散热型号；以安装图为准"]
    assert body[0]["sources"][0]["id"] == source_id
    assert body[0]["sources"][0]["source_type"] == "text"
    assert body[0]["created_at"]

    parent_body = (
        await client.get(f"/api/projects/{project['id']}/nodes/{parent['id']}/entries")
    ).json()
    assert parent_body == []


@pytest.mark.asyncio
async def test_node_entries_exclude_conflict_status(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_id, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
    )
    conflict = Entry(
        workspace_id=workspace_id,
        project_id=project["id"],
        node_id=node["id"],
        entry_type="experience",
        title="冲突状态记录",
        content="不应出现在列表",
        status="conflict",
    )
    db.add(conflict)
    await db.commit()

    body = (
        await client.get(f"/api/projects/{project['id']}/nodes/{node['id']}/entries")
    ).json()
    assert [item["id"] for item in body] == [entry_id]


@pytest.mark.asyncio
async def test_node_entries_hide_other_workspace_and_foreign_node(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project_a = await create_project(client, "项目A")
    node_a = await _create_node(client, project_a["id"], "冰箱")

    async with db.begin():
        await create_account(db, "other", "other password")
    login_response = await client.post(
        "/api/auth/login",
        json={"account": "other", "password": "other password"},
    )
    assert login_response.status_code == 200

    response = await client.get(
        f"/api/projects/{project_a['id']}/nodes/{node_a['id']}/entries"
    )
    assert response.status_code == 404

    await client.post(
        "/api/auth/login",
        json={"account": "owner", "password": "correct horse battery"},
    )
    project_b = await create_project(client, "项目B")
    node_b = await _create_node(client, project_b["id"], "台面")
    response = await client.get(
        f"/api/projects/{project_a['id']}/nodes/{node_b['id']}/entries"
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_node_entries_ordered_by_created_at_desc(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    now = _naive_utc_now()
    entries = []
    for index, title in enumerate(["最早记录", "中间记录", "最新记录"]):
        entry = Entry(
            workspace_id=workspace_id,
            project_id=project["id"],
            node_id=node["id"],
            entry_type="experience",
            title=title,
            content="排序正文",
            status="archived",
        )
        entry.created_at = now + timedelta(minutes=index)
        db.add(entry)
        entries.append(entry)
    await db.commit()

    body = (
        await client.get(f"/api/projects/{project['id']}/nodes/{node['id']}/entries")
    ).json()
    assert [item["title"] for item in body] == ["最新记录", "中间记录", "最早记录"]


@pytest.mark.asyncio
async def test_node_list_includes_entry_counts(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    node_a = await _create_node(client, project["id"], "冰箱")
    node_b = await _create_node(client, project["id"], "台面")
    for index in range(2):
        db.add(
            Entry(
                workspace_id=workspace_id,
                project_id=project["id"],
                node_id=node_a["id"],
                entry_type="experience",
                title=f"冰箱记录 {index}",
                content="",
                status="archived",
            )
        )
    db.add(
        Entry(
            workspace_id=workspace_id,
            project_id=project["id"],
            node_id=node_b["id"],
            entry_type="experience",
            title="台面记录",
            content="",
            status="archived",
        )
    )
    db.add(
        Entry(
            workspace_id=workspace_id,
            project_id=project["id"],
            node_id=node_a["id"],
            entry_type="experience",
            title="冲突记录",
            content="",
            status="conflict",
        )
    )
    await db.commit()

    body = (await client.get(f"/api/projects/{project['id']}/nodes")).json()
    counts = {item["id"]: item["entry_count"] for item in body}
    assert counts[node_a["id"]] == 2
    assert counts[node_b["id"]] == 1


@pytest.mark.asyncio
async def test_source_detail_includes_related_entries(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_id, source_id = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
    )

    detail = (await client.get(f"/api/inbox/sources/{source_id}")).json()
    assert len(detail["entries"]) == 1
    related = detail["entries"][0]
    assert related["id"] == entry_id
    assert related["entry_type"] == "pitfall"
    assert related["title"] == "散热方式决定侧边预留"
    assert related["project_id"] == project["id"]
    assert related["node_id"] == node["id"]

    empty_source = await capture(client, source_type="text", content="还没有确认的来源")
    empty_detail = (await client.get(f"/api/inbox/sources/{empty_source['id']}")).json()
    assert empty_detail["entries"] == []
