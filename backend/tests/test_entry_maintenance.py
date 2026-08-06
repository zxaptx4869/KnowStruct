import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Entry, EntrySource, Extraction, Source
from app.services.accounts import create_account
from tests.test_inbox_api import create_project, login_owner
from tests.test_node_entries import _accepted_entry, _create_node


@pytest.mark.asyncio
async def test_update_entry_fields_and_keep_extraction(
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
        conditions=["底部散热型号"],
    )

    response = await client.patch(
        f"/api/projects/{project['id']}/entries/{entry_id}",
        json={
            "title": "修正后的记录标题",
            "content": "修正后的正式内容",
            "entry_type": "experience",
            "applicable_conditions": ["新条件A", "新条件B"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "修正后的记录标题"
    assert body["content"] == "修正后的正式内容"
    assert body["entry_type"] == "experience"
    assert body["applicable_conditions"] == ["新条件A", "新条件B"]
    assert body["node_id"] == node["id"]

    stored = await db.scalar(select(Entry).where(Entry.id == entry_id))
    assert stored is not None
    assert stored.title == "修正后的记录标题"
    assert stored.entry_type == "experience"
    assert stored.applicable_conditions == ["新条件A", "新条件B"]

    extraction = await db.scalar(
        select(Extraction).where(Extraction.id == stored.extraction_id)
    )
    assert extraction is not None
    assert extraction.title == "散热方式决定侧边预留"
    assert extraction.applicable_conditions == ["底部散热型号"]


@pytest.mark.asyncio
async def test_update_node_within_project_updates_counts(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node_a = await _create_node(client, project["id"], "冰箱")
    node_b = await _create_node(client, project["id"], "台面")
    entry_id, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node_a["id"],
    )

    response = await client.patch(
        f"/api/projects/{project['id']}/entries/{entry_id}",
        json={"node_id": node_b["id"]},
    )
    assert response.status_code == 200
    assert response.json()["node_id"] == node_b["id"]

    counts = {
        item["id"]: item["entry_count"]
        for item in (await client.get(f"/api/projects/{project['id']}/nodes")).json()
    }
    assert counts[node_a["id"]] == 0
    assert counts[node_b["id"]] == 1


@pytest.mark.asyncio
async def test_clear_archive_node(
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
    )

    response = await client.patch(
        f"/api/projects/{project['id']}/entries/{entry_id}",
        json={"node_id": None},
    )
    assert response.status_code == 200
    assert response.json()["node_id"] is None
    stored = await db.scalar(select(Entry).where(Entry.id == entry_id))
    assert stored is not None and stored.node_id is None
    assert stored.project_id == project["id"]


@pytest.mark.asyncio
async def test_reject_blank_and_empty_updates(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    entry_id, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
    )
    url = f"/api/projects/{project['id']}/entries/{entry_id}"
    for payload in [
        {"title": "   "},
        {"content": ""},
        {},
    ]:
        response = await client.patch(url, json=payload)
        assert response.status_code == 422
    stored = await db.scalar(select(Entry).where(Entry.id == entry_id))
    assert stored is not None and stored.title == "散热方式决定侧边预留"


@pytest.mark.asyncio
async def test_reject_node_from_another_project(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project_a = await create_project(client, "项目A")
    project_b = await create_project(client, "项目B")
    entry_id, _ = await _accepted_entry(
        client,
        db,
        project_id=project_a["id"],
    )
    foreign_node = await _create_node(client, project_b["id"], "台面")

    response = await client.patch(
        f"/api/projects/{project_a['id']}/entries/{entry_id}",
        json={"node_id": foreign_node["id"]},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "invalid_node_for_project"
    stored = await db.scalar(select(Entry).where(Entry.id == entry_id))
    assert stored is not None and stored.node_id is None


@pytest.mark.asyncio
async def test_workspace_isolation_for_edit_and_delete(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    entry_id, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
    )

    await create_account(db, "other", "other password")
    await db.commit()
    login_response = await client.post(
        "/api/auth/login",
        json={"account": "other", "password": "other password"},
    )
    assert login_response.status_code == 200

    patch_response = await client.patch(
        f"/api/projects/{project['id']}/entries/{entry_id}",
        json={"title": "越权修改"},
    )
    assert patch_response.status_code == 404
    delete_response = await client.delete(
        f"/api/projects/{project['id']}/entries/{entry_id}"
    )
    assert delete_response.status_code == 404

    await client.post(
        "/api/auth/login",
        json={"account": "owner", "password": "correct horse battery"},
    )
    stored = await db.scalar(select(Entry).where(Entry.id == entry_id))
    assert stored is not None and stored.title == "散热方式决定侧边预留"


@pytest.mark.asyncio
async def test_delete_keeps_source_and_extraction(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    node = await _create_node(client, project["id"], "冰箱")
    entry_id, source_id = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
        node_id=node["id"],
    )
    extraction_id = await db.scalar(
        select(Entry.extraction_id).where(Entry.id == entry_id)
    )

    response = await client.delete(
        f"/api/projects/{project['id']}/entries/{entry_id}"
    )
    assert response.status_code == 204

    assert await db.scalar(select(func.count(Entry.id)).where(Entry.id == entry_id)) == 0
    assert (
        await db.scalar(
            select(func.count(EntrySource.entry_id)).where(
                EntrySource.entry_id == entry_id
            )
        )
        == 0
    )
    source = await db.scalar(select(Source).where(Source.id == source_id))
    assert source is not None and source.workspace_id == workspace_id
    extraction = await db.scalar(
        select(Extraction).where(Extraction.id == extraction_id)
    )
    assert extraction is not None and extraction.status == "accepted"

    counts = {
        item["id"]: item["entry_count"]
        for item in (await client.get(f"/api/projects/{project['id']}/nodes")).json()
    }
    assert counts[node["id"]] == 0


@pytest.mark.asyncio
async def test_repeated_and_foreign_delete_returns_not_found(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    entry_id, _ = await _accepted_entry(
        client,
        db,
        project_id=project["id"],
    )
    url = f"/api/projects/{project['id']}/entries/{entry_id}"

    assert (await client.delete(url)).status_code == 204
    assert (await client.delete(url)).status_code == 404
