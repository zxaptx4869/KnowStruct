import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Source
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


async def create_project(client: AsyncClient, name: str = "新房装修") -> dict:
    response = await client.post("/api/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()


async def capture(client: AsyncClient, **payload: object) -> dict:
    response = await client.post("/api/inbox/sources", json=payload)
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_capture_text_without_project(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(
        client,
        source_type="text",
        content="  零嵌冰箱要看底部散热\n第二条内容  ",
    )
    assert source["source_type"] == "text"
    assert source["title"] == "零嵌冰箱要看底部散热"
    assert source["project_id"] is None
    assert source["project_name"] is None
    assert source["content_status"] == "saved"
    assert source["processing_state"] == "processing"
    assert source["task"]["status"] == "pending"
    assert source["candidates"] == {
        "pending_confirm": 0,
        "accepted": 0,
        "rejected": 0,
    }

    listed = (await client.get("/api/inbox/sources")).json()
    assert [item["id"] for item in listed] == [source["id"]]
    assert listed[0]["processing_state"] == "processing"


@pytest.mark.asyncio
async def test_capture_text_with_project(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    source = await capture(
        client,
        source_type="text",
        content="厨房插座定位现场记录",
        project_id=project["id"],
    )
    assert source["project_id"] == project["id"]
    listed = (await client.get("/api/inbox/sources")).json()
    assert listed[0]["project_name"] == "新房装修"


@pytest.mark.asyncio
async def test_reject_invalid_text_input(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    for content in ["   ", "x" * 20001]:
        response = await client.post(
            "/api/inbox/sources",
            json={"source_type": "text", "content": content},
        )
        assert response.status_code == 422
    assert (await client.get("/api/inbox/sources")).json() == []
    count = await db.scalar(select(func.count(Source.id)))
    assert count == 0


@pytest.mark.asyncio
async def test_capture_and_validate_link(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(
        client,
        source_type="link",
        link_url="https://example.com/product/123",
        content="洗烘套装商品参数页",
    )
    assert source["source_type"] == "link"
    assert source["link_url"] == "https://example.com/product/123"
    assert source["title"] == "洗烘套装商品参数页"

    invalid_payloads = [
        {"source_type": "link", "link_url": "not-a-url", "content": "说明"},
        {"source_type": "link", "link_url": "ftp://example.com/x", "content": "说明"},
        {"source_type": "link", "link_url": "https://example.com/x", "content": "   "},
        {"source_type": "link", "link_url": "https://example.com/x", "content": "x" * 2001},
    ]
    for payload in invalid_payloads:
        response = await client.post("/api/inbox/sources", json=payload)
        assert response.status_code == 422
    count = await db.scalar(select(func.count(Source.id)))
    assert count == 1


@pytest.mark.asyncio
async def test_reject_project_from_another_workspace(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    async with db.begin():
        other = await create_account(db, "other", "another valid password")
        from app.models import Project

        hidden = Project(workspace_id=other.workspace.id, name="其他项目")
        db.add(hidden)
        await db.flush()
        hidden_id = hidden.id

    response = await client.post(
        "/api/inbox/sources",
        json={"source_type": "text", "content": "内容", "project_id": hidden_id},
    )
    assert response.status_code == 404
    assert (await client.get("/api/inbox/sources")).json() == []


@pytest.mark.asyncio
async def test_empty_inbox(client: AsyncClient, db: AsyncSession) -> None:
    await login_owner(client, db)
    assert (await client.get("/api/inbox/sources")).json() == []


@pytest.mark.asyncio
async def test_source_list_filters(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    text = await capture(client, source_type="text", content="零嵌冰箱散热方式")
    await capture(
        client,
        source_type="link",
        link_url="https://example.com/a",
        content="洗烘套装商品参数页",
        project_id=project["id"],
    )

    text_only = (await client.get("/api/inbox/sources", params={"source_type": "text"})).json()
    assert [item["id"] for item in text_only] == [text["id"]]

    project_only = (
        await client.get("/api/inbox/sources", params={"project_id": project["id"]})
    ).json()
    assert len(project_only) == 1
    assert project_only[0]["project_id"] == project["id"]

    search = (await client.get("/api/inbox/sources", params={"q": "洗烘"})).json()
    assert len(search) == 1
    assert search[0]["source_type"] == "link"


@pytest.mark.asyncio
async def test_inbox_access_is_workspace_scoped(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(client, source_type="text", content="仅本人可见")

    async with db.begin():
        other = await create_account(db, "other", "another valid password")
        from app.models import Source as SourceModel

        hidden = SourceModel(
            workspace_id=other.workspace.id,
            source_type="text",
            title="他人资料",
            content="不可见",
        )
        db.add(hidden)
        await db.flush()
        hidden_id = hidden.id

    visible = (await client.get("/api/inbox/sources")).json()
    assert [item["id"] for item in visible] == [source["id"]]
    assert (await client.get(f"/api/inbox/sources/{hidden_id}")).status_code == 404
    assert (
        await client.post(f"/api/inbox/sources/{hidden_id}/retry")
    ).status_code == 404
    assert (
        await client.post(f"/api/inbox/sources/{source['id']}/complete")
    ).status_code == 409


@pytest.mark.asyncio
async def test_inbox_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/inbox/sources")).status_code == 401
    assert (
        await client.post(
            "/api/inbox/sources",
            json={"source_type": "text", "content": "内容"},
        )
    ).status_code == 401
