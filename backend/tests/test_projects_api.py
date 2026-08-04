import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project
from app.services.accounts import create_account


async def login_owner(client: AsyncClient, db: AsyncSession) -> str:
    async with db.begin():
        user = await create_account(db, "owner", "correct horse battery")
        workspace_id = user.workspace.id
    response = await client.post(
        "/api/auth/login",
        json={"account": "owner", "password": "correct horse battery"},
    )
    assert response.status_code == 200
    return workspace_id


@pytest.mark.asyncio
async def test_project_crud_status_and_live_node_count(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    assert (await client.get("/api/projects")).json() == []

    created = await client.post(
        "/api/projects",
        json={
            "name": "  新房装修  ",
            "goal": " 整理施工和采购经验 ",
            "background": " 设计方案已确认 ",
        },
    )
    assert created.status_code == 201
    project = created.json()
    assert project["name"] == "新房装修"
    assert project["status"] == "planning"
    assert project["node_count"] == 0

    node = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "硬装施工"},
    )
    assert node.status_code == 201
    projects = (await client.get("/api/projects")).json()
    assert projects[0]["node_count"] == 1

    updated = await client.patch(
        f"/api/projects/{project['id']}",
        json={"status": "active", "goal": "进入施工和采购阶段"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "active"
    assert updated.json()["node_count"] == 1

    deleted = await client.delete(f"/api/projects/{project['id']}")
    assert deleted.status_code == 204
    assert (await client.get("/api/projects")).json() == []


@pytest.mark.asyncio
async def test_project_validation_writes_nothing(client: AsyncClient, db: AsyncSession) -> None:
    await login_owner(client, db)
    invalid_payloads = [
        {"name": "   "},
        {"name": "x" * 101},
        {"name": "新房装修", "goal": "x" * 501},
        {"name": "新房装修", "background": "x" * 2001},
        {"name": "新房装修", "status": "archived"},
    ]
    for payload in invalid_payloads:
        response = await client.post("/api/projects", json=payload)
        assert response.status_code == 422
    assert (await client.get("/api/projects")).json() == []


@pytest.mark.asyncio
async def test_project_access_is_workspace_scoped(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    async with db.begin():
        other = await create_account(db, "other", "another valid password")
        hidden = Project(workspace_id=other.workspace.id, name="其他项目")
        db.add(hidden)
        await db.flush()
        hidden_id = hidden.id

    assert (await client.get(f"/api/projects/{hidden_id}")).status_code == 404
    assert (
        await client.patch(f"/api/projects/{hidden_id}", json={"name": "篡改"})
    ).status_code == 404
    assert (await client.delete(f"/api/projects/{hidden_id}")).status_code == 404
    stored = await db.scalar(select(Project).where(Project.id == hidden_id))
    assert stored is not None and stored.name == "其他项目"


@pytest.mark.asyncio
async def test_projects_require_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/projects")).status_code == 401
    assert (await client.post("/api/projects", json={"name": "新房装修"})).status_code == 401
