import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.accounts import create_account


async def setup_project(client: AsyncClient, db: AsyncSession) -> str:
    async with db.begin():
        await create_account(db, "owner", "correct horse battery")
    login = await client.post(
        "/api/auth/login",
        json={"account": "owner", "password": "correct horse battery"},
    )
    assert login.status_code == 200
    project = await client.post("/api/projects", json={"name": "新房装修"})
    assert project.status_code == 201
    return project.json()["id"]


async def add_node(
    client: AsyncClient,
    project_id: str,
    name: str,
    parent_id: str | None = None,
) -> dict:
    response = await client.post(
        f"/api/projects/{project_id}/nodes",
        json={"name": name, "parent_id": parent_id},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_three_level_tree_names_and_rename_identity(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project_id = await setup_project(client, db)
    furniture = await add_node(client, project_id, "家具家电")
    appliances = await add_node(client, project_id, "大家电", furniture["id"])
    fridge = await add_node(client, project_id, "冰箱", appliances["id"])

    duplicate = await client.post(
        f"/api/projects/{project_id}/nodes",
        json={"name": "  冰箱  ", "parent_id": appliances["id"]},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "duplicate_node_name"

    other_root = await add_node(client, project_id, "采购")
    same_name = await add_node(client, project_id, "冰箱", other_root["id"])
    assert same_name["id"] != fridge["id"]

    renamed = await client.patch(
        f"/api/projects/{project_id}/nodes/{appliances['id']}",
        json={"name": "厨房大家电", "description": "厨房设备分类"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["id"] == appliances["id"]
    nodes = (await client.get(f"/api/projects/{project_id}/nodes")).json()
    stored_fridge = next(node for node in nodes if node["id"] == fridge["id"])
    assert stored_fridge["parent_id"] == appliances["id"]


@pytest.mark.asyncio
async def test_maximum_depth_and_move_depth_rollback(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project_id = await setup_project(client, db)
    parent_id = None
    chain = []
    for level in range(1, 7):
        node = await add_node(client, project_id, f"第{level}层", parent_id)
        chain.append(node)
        parent_id = node["id"]

    seventh = await client.post(
        f"/api/projects/{project_id}/nodes",
        json={"name": "第7层", "parent_id": parent_id},
    )
    assert seventh.status_code == 409
    assert seventh.json()["detail"]["code"] == "node_depth_exceeded"

    branch = await add_node(client, project_id, "另一分支")
    child = await add_node(client, project_id, "子节点", branch["id"])
    too_deep = await client.post(
        f"/api/projects/{project_id}/nodes/{branch['id']}/move",
        json={"parent_id": chain[4]["id"], "position": 0},
    )
    assert too_deep.status_code == 409
    nodes = (await client.get(f"/api/projects/{project_id}/nodes")).json()
    stored_branch = next(node for node in nodes if node["id"] == branch["id"])
    stored_child = next(node for node in nodes if node["id"] == child["id"])
    assert stored_branch["parent_id"] is None
    assert stored_child["parent_id"] == branch["id"]


@pytest.mark.asyncio
async def test_reorder_move_cycle_and_subtree_delete(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project_id = await setup_project(client, db)
    appliances = await add_node(client, project_id, "大家电")
    fridge = await add_node(client, project_id, "冰箱", appliances["id"])
    washer = await add_node(client, project_id, "洗衣机", appliances["id"])
    kitchen = await add_node(client, project_id, "厨房")

    reordered = await client.post(
        f"/api/projects/{project_id}/nodes/{washer['id']}/move",
        json={"parent_id": appliances["id"], "position": 0},
    )
    assert reordered.status_code == 200
    siblings = [
        node
        for node in (await client.get(f"/api/projects/{project_id}/nodes")).json()
        if node["parent_id"] == appliances["id"]
    ]
    assert [(node["name"], node["sort_order"]) for node in siblings] == [
        ("洗衣机", 0),
        ("冰箱", 1),
    ]

    moved = await client.post(
        f"/api/projects/{project_id}/nodes/{fridge['id']}/move",
        json={"parent_id": kitchen["id"], "position": 0},
    )
    assert moved.status_code == 200
    assert moved.json()["parent_id"] == kitchen["id"]

    cycle = await client.post(
        f"/api/projects/{project_id}/nodes/{kitchen['id']}/move",
        json={"parent_id": fridge["id"], "position": 0},
    )
    assert cycle.status_code == 409
    assert cycle.json()["detail"]["code"] == "cyclic_node_move"

    deleted = await client.delete(f"/api/projects/{project_id}/nodes/{kitchen['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted_count"] == 2
    remaining = (await client.get(f"/api/projects/{project_id}/nodes")).json()
    assert {node["name"] for node in remaining} == {"大家电", "洗衣机"}


@pytest.mark.asyncio
async def test_cross_project_and_workspace_node_access(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    project_id = await setup_project(client, db)
    first = await add_node(client, project_id, "第一项目节点")
    second_project = await client.post("/api/projects", json={"name": "第二项目"})
    second_id = second_project.json()["id"]
    second = await add_node(client, second_id, "第二项目节点")

    cross_parent = await client.post(
        f"/api/projects/{project_id}/nodes/{first['id']}/move",
        json={"parent_id": second["id"], "position": 0},
    )
    assert cross_parent.status_code == 404

    async with db.begin():
        await create_account(db, "other", "another valid password")
    other_client = AsyncClient(
        transport=client._transport,
        base_url="http://test",
        headers={"Origin": "http://localhost:5174"},
    )
    try:
        login = await other_client.post(
            "/api/auth/login",
            json={"account": "other", "password": "another valid password"},
        )
        assert login.status_code == 200
        hidden = await other_client.get(f"/api/projects/{project_id}/nodes")
        assert hidden.status_code == 404
    finally:
        await other_client.aclose()


@pytest.mark.asyncio
async def test_directory_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/projects/missing/nodes")).status_code == 401
