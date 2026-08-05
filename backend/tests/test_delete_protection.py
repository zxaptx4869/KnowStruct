import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project
from app.services.task_worker import process_next_task
from tests.fakes import FakeAIProvider
from tests.test_inbox_api import capture, create_project, login_owner


@pytest.mark.asyncio
async def test_project_deletion_blocked_by_assigned_source(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    await capture(
        client,
        source_type="text",
        content="已分配的资料",
        project_id=project["id"],
    )
    response = await client.delete(f"/api/projects/{project['id']}")
    assert response.status_code == 409
    assert response.json()["detail"]["blocker_count"] >= 1
    stored = await db.scalar(select(Project).where(Project.id == project["id"]))
    assert stored is not None


@pytest.mark.asyncio
async def test_project_deletion_allowed_with_unassigned_source(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    await capture(client, source_type="text", content="未分配资料")
    response = await client.delete(f"/api/projects/{project['id']}")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_project_deletion_blocked_by_entry(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    source = await capture(client, source_type="text", content="零嵌冰箱散热方式")
    await process_next_task(db, FakeAIProvider())
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    extraction = detail["extractions"][0]
    decide = await client.post(
        f"/api/inbox/sources/{source['id']}/extractions/{extraction['id']}/decide",
        json={"decision": "accepted", "project_id": project["id"]},
    )
    assert decide.status_code == 200

    response = await client.delete(f"/api/projects/{project['id']}")
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_node_subtree_deletion_blocked_by_entry(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    parent = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "家具家电"},
    )
    child = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "冰箱", "parent_id": parent.json()["id"]},
    )
    source = await capture(client, source_type="text", content="零嵌冰箱散热方式")
    await process_next_task(db, FakeAIProvider())
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    extraction = detail["extractions"][0]
    decide = await client.post(
        f"/api/inbox/sources/{source['id']}/extractions/{extraction['id']}/decide",
        json={
            "decision": "accepted",
            "project_id": project["id"],
            "node_id": child.json()["id"],
        },
    )
    assert decide.status_code == 200

    blocked = await client.delete(
        f"/api/projects/{project['id']}/nodes/{parent.json()['id']}"
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["blocker_count"] == 1

    other_node = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "空分支"},
    )
    deleted = await client.delete(
        f"/api/projects/{project['id']}/nodes/{other_node.json()['id']}"
    )
    assert deleted.status_code == 200
    assert deleted.json()["deleted_count"] == 1
