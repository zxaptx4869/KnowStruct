import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Entry, EntrySource, Node, Project, Source
from app.services.accounts import create_account
from tests.test_inbox_api import capture, create_project, login_owner


async def create_node(
    client: AsyncClient,
    project_id: str,
    name: str,
    *,
    parent_id: str | None = None,
) -> dict:
    response = await client.post(
        f"/api/projects/{project_id}/nodes",
        json={"name": name, "parent_id": parent_id},
    )
    assert response.status_code == 201
    return response.json()


async def add_entry(
    db: AsyncSession,
    *,
    workspace_id: str,
    project_id: str,
    node_id: str | None = None,
    title: str = "测试记录",
    content: str = "测试内容",
    entry_type: str = "experience",
) -> str:
    async with db.begin():
        entry = Entry(
            workspace_id=workspace_id,
            project_id=project_id,
            node_id=node_id,
            entry_type=entry_type,
            title=title,
            content=content,
            status="archived",
        )
        db.add(entry)
        await db.flush()
        return entry.id


async def link_source(
    db: AsyncSession,
    *,
    workspace_id: str,
    entry_id: str,
    source_id: str,
) -> None:
    async with db.begin():
        db.add(EntrySource(entry_id=entry_id, source_id=source_id))


@pytest.mark.asyncio
async def test_project_records_list_includes_unarchived(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    node = await create_node(client, project["id"], "大家电")
    archived_id = await add_entry(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
        node_id=node["id"],
        title="已归档记录",
    )
    unarchived_id = await add_entry(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
        title="未归档记录",
    )
    source = await capture(client, source_type="text", content="来源内容")
    await link_source(
        db,
        workspace_id=workspace_id,
        entry_id=archived_id,
        source_id=source["id"],
    )

    response = await client.get(f"/api/projects/{project['id']}/entries")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["unarchived_count"] == 1
    by_id = {item["id"]: item for item in body["items"]}
    assert by_id[archived_id]["node_path"] == ["大家电"]
    assert len(by_id[archived_id]["sources"]) == 1
    assert by_id[unarchived_id]["node_id"] is None
    assert by_id[unarchived_id]["node_path"] == []
    assert {item["id"] for item in body["items"]} == {unarchived_id, archived_id}


@pytest.mark.asyncio
async def test_project_counts_in_detail_and_list(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    node = await create_node(client, project["id"], "冰箱")
    await add_entry(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
        node_id=node["id"],
    )
    await add_entry(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
    )

    detail = (await client.get(f"/api/projects/{project['id']}")).json()
    assert detail["entry_count"] == 2
    assert detail["unarchived_entry_count"] == 1

    listed = (await client.get("/api/projects")).json()
    project_item = next(item for item in listed if item["id"] == project["id"])
    assert project_item["entry_count"] == 2
    assert project_item["unarchived_entry_count"] == 1


@pytest.mark.asyncio
async def test_project_records_empty_and_foreign_workspace(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    empty = (await client.get(f"/api/projects/{project['id']}/entries")).json()
    assert empty == {"items": [], "total": 0, "unarchived_count": 0}

    async with db.begin():
        other = await create_account(db, "other", "another valid password")
        hidden = Project(workspace_id=other.workspace.id, name="其他项目")
        db.add(hidden)
        await db.flush()
        hidden_id = hidden.id
    hidden_response = await client.get(f"/api/projects/{hidden_id}/entries")
    assert hidden_response.status_code == 404


@pytest.mark.asyncio
async def test_batch_move_records_to_node_and_unarchived(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    first_node = await create_node(client, project["id"], "大家电")
    second_node = await create_node(client, project["id"], "小家电")
    first_id = await add_entry(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
        node_id=first_node["id"],
        title="第一条",
    )
    second_id = await add_entry(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
        node_id=first_node["id"],
        title="第二条",
    )

    moved = await client.post(
        f"/api/projects/{project['id']}/entries/batch/move",
        json={"entry_ids": [first_id, second_id], "node_id": second_node["id"]},
    )
    assert moved.status_code == 200
    assert moved.json() == {"moved": 2}

    unarchived = await client.post(
        f"/api/projects/{project['id']}/entries/batch/move",
        json={"entry_ids": [first_id], "node_id": None},
    )
    assert unarchived.status_code == 200
    assert unarchived.json() == {"moved": 1}

    body = (await client.get(f"/api/projects/{project['id']}/entries")).json()
    by_id = {item["id"]: item for item in body["items"]}
    assert by_id[first_id]["node_id"] is None
    assert by_id[second_id]["node_id"] == second_node["id"]


@pytest.mark.asyncio
async def test_batch_move_rejects_foreign_node_and_entries(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    node = await create_node(client, project["id"], "冰箱")
    entry_id = await add_entry(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
        node_id=node["id"],
    )

    async with db.begin():
        other = await create_account(db, "other", "another valid password")
        other_project = Project(workspace_id=other.workspace.id, name="其他项目")
        db.add(other_project)
        await db.flush()

        other_node = Node(
            project_id=other_project.id,
            sibling_scope=other_project.id,
            name="外部节点",
            normalized_name="外部节点",
            sort_order=0,
        )
        db.add(other_node)
        await db.flush()
        other_node_id = other_node.id
        other_entry = Entry(
            workspace_id=other.workspace.id,
            project_id=other_project.id,
            entry_type="experience",
            title="外部记录",
            content="外部内容",
            status="archived",
        )
        db.add(other_entry)
        await db.flush()
        other_entry_id = other_entry.id

    foreign_node = await client.post(
        f"/api/projects/{project['id']}/entries/batch/move",
        json={"entry_ids": [entry_id], "node_id": other_node_id},
    )
    assert foreign_node.status_code == 409

    foreign_entry = await client.post(
        f"/api/projects/{project['id']}/entries/batch/move",
        json={"entry_ids": [entry_id, other_entry_id], "node_id": node["id"]},
    )
    assert foreign_entry.status_code == 404


@pytest.mark.asyncio
async def test_batch_delete_keeps_sources(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    first_id = await add_entry(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
        title="待删除一",
    )
    second_id = await add_entry(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
        title="待删除二",
    )
    source = await capture(client, source_type="text", content="保留的来源")
    await link_source(
        db,
        workspace_id=workspace_id,
        entry_id=first_id,
        source_id=source["id"],
    )

    response = await client.post(
        f"/api/projects/{project['id']}/entries/batch/delete",
        json={"entry_ids": [first_id, second_id]},
    )
    assert response.status_code == 200
    assert response.json() == {"deleted": 2}

    entry_count = await db.scalar(select(func.count(Entry.id)))
    assert entry_count == 0
    source_count = await db.scalar(select(func.count(Source.id)))
    assert source_count == 1
    link_count = await db.scalar(select(func.count(EntrySource.entry_id)))
    assert link_count == 0


@pytest.mark.asyncio
async def test_batch_rejects_empty_and_oversized_requests(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    empty = await client.post(
        f"/api/projects/{project['id']}/entries/batch/move",
        json={"entry_ids": [], "node_id": None},
    )
    assert empty.status_code == 422
    oversized = await client.post(
        f"/api/projects/{project['id']}/entries/batch/delete",
        json={"entry_ids": [f"id-{index}" for index in range(101)]},
    )
    assert oversized.status_code == 422
