from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Entry, EntrySource, Extraction, Source
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
    title: str = "零嵌冰箱散热方式",
    content: str = "零嵌冰箱需要先确认散热方式，再决定柜体侧边预留尺寸。",
    node_id: str | None = None,
    project_id: str | None = None,
) -> tuple[str, str, dict]:
    """采集 -> AI 提取 -> 接受候选，返回 (entry_id, source_id, project)。"""
    project = await create_project(client) if project_id is None else {
        "id": project_id,
    }
    source = await capture(client, source_type="text", content=content)
    await process_next_task(db, FakeAIProvider())
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    extraction = detail["extractions"][0]
    response = await client.post(
        f"/api/inbox/sources/{source['id']}/extractions/{extraction['id']}/decide",
        json={
            "decision": "accepted",
            "project_id": project["id"],
            "node_id": node_id,
            "title": title,
            "content": content,
            "entry_type": "pitfall",
        },
    )
    assert response.status_code == 200
    entry = response.json()["entry"]
    return entry["id"], source["id"], project


async def _search(client: AsyncClient, q: str, **filters: object) -> dict:
    response = await client.get("/api/search", params={"q": q, **filters})
    assert response.status_code == 200
    return response.json()


@pytest.mark.asyncio
async def test_blank_and_overlong_query_rejected(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    for q in ["", "   "]:
        response = await client.get("/api/search", params={"q": q})
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "empty_query"
    response = await client.get("/api/search", params={"q": "x" * 101})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "query_too_long"


@pytest.mark.asyncio
async def test_entry_matches_by_title_and_content(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    entry_id, _, _ = await _accepted_entry(
        client,
        db,
        title="零嵌冰箱散热方式",
        content="底部散热型号左右通常只需少量安装余量。",
    )

    by_title = await _search(client, "散热方式")
    assert [item["id"] for item in by_title["entries"]] == [entry_id]
    assert by_title["entries"][0]["title"] == "零嵌冰箱散热方式"

    by_content = await _search(client, "安装余量")
    assert [item["id"] for item in by_content["entries"]] == [entry_id]


@pytest.mark.asyncio
async def test_source_hits_returned_as_evidence(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    text_source = await capture(
        client,
        source_type="text",
        content="橱柜台面石英石报价与损耗说明",
    )
    link_source = await capture(
        client,
        source_type="link",
        link_url="https://example.com/refrigerator-guide",
        content="零嵌冰箱安装尺寸参考",
    )

    body = await _search(client, "石英石")
    assert [item["id"] for item in body["sources"]] == [text_source["id"]]
    assert body["sources"][0]["entry_count"] == 0

    body = await _search(client, "refrigerator-guide")
    assert [item["id"] for item in body["sources"]] == [link_source["id"]]
    assert body["sources"][0]["source_type"] == "link"


@pytest.mark.asyncio
async def test_wildcard_characters_are_literal(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    now = _naive_utc_now()
    entries = [
        Entry(
            workspace_id=workspace_id,
            project_id=project["id"],
            entry_type="experience",
            title="100%棉面料记录",
            content="",
            status="archived",
        ),
        Entry(
            workspace_id=workspace_id,
            project_id=project["id"],
            entry_type="experience",
            title="100X棉面料记录",
            content="",
            status="archived",
        ),
        Entry(
            workspace_id=workspace_id,
            project_id=project["id"],
            entry_type="experience",
            title="A_B分隔线记录",
            content="",
            status="archived",
        ),
    ]
    for index, entry in enumerate(entries):
        entry.created_at = now + timedelta(minutes=index)
        db.add(entry)
    await db.commit()

    body = await _search(client, "100%棉")
    assert [item["title"] for item in body["entries"]] == ["100%棉面料记录"]

    body = await _search(client, "A_B")
    assert [item["title"] for item in body["entries"]] == ["A_B分隔线记录"]


@pytest.mark.asyncio
async def test_search_merges_multiple_projects(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project_a = await create_project(client, "新房装修")
    project_b = await create_project(client, "日本旅行")
    now = _naive_utc_now()
    for index, project_id in enumerate([project_a["id"], project_b["id"]]):
        entry = Entry(
            workspace_id=workspace_id,
            project_id=project_id,
            entry_type="experience",
            title="京都交通说明",
            content="西瓜卡充值方式",
            status="archived",
        )
        entry.created_at = now + timedelta(minutes=index)
        db.add(entry)
    await db.commit()

    body = await _search(client, "京都")
    assert len(body["entries"]) == 2
    assert {item["project_id"] for item in body["entries"]} == {
        project_a["id"],
        project_b["id"],
    }


@pytest.mark.asyncio
async def test_other_workspace_data_is_hidden(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    async with db.begin():
        other = await create_account(db, "other", "other password")
        other_workspace_id = other.workspace.id
    project = await create_project(client, "新房装修")
    entry = Entry(
        workspace_id=workspace_id,
        project_id=project["id"],
        entry_type="experience",
        title="装修秘密记录",
        content="",
        status="archived",
    )
    db.add(entry)
    await db.commit()

    login_response = await client.post(
        "/api/auth/login",
        json={"account": "other", "password": "other password"},
    )
    assert login_response.status_code == 200
    other_project = await create_project(client, "别的项目")
    other_entry = Entry(
        workspace_id=other_workspace_id,
        project_id=other_project["id"],
        entry_type="experience",
        title="装修秘密记录",
        content="",
        status="archived",
    )
    db.add(other_entry)
    await db.commit()

    body = await _search(client, "装修秘密记录")
    assert len(body["entries"]) == 1
    assert body["entries"][0]["project_id"] == other_project["id"]

    await client.post(
        "/api/auth/login",
        json={"account": "owner", "password": "correct horse battery"},
    )
    body = await _search(client, "装修秘密记录")
    assert len(body["entries"]) == 1
    assert body["entries"][0]["project_id"] == project["id"]


@pytest.mark.asyncio
async def test_node_path_and_unfiled_entry(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client, "新房装修")
    parent = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "家具家电"},
    )
    assert parent.status_code == 201
    child = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "冰箱", "parent_id": parent.json()["id"]},
    )
    assert child.status_code == 201
    filed_id, _, _ = await _accepted_entry(
        client,
        db,
        title="散热决定预留",
        content="底部散热与两侧散热预留不同",
        node_id=child.json()["id"],
        project_id=project["id"],
    )
    unfiled_id, _, _ = await _accepted_entry(
        client,
        db,
        title="插座高度记录",
        content="开关插座高度待复核",
    )

    body = await _search(client, "散热")
    assert [item["id"] for item in body["entries"]] == [filed_id]
    assert body["entries"][0]["node_id"] == child.json()["id"]
    assert body["entries"][0]["node_path"] == ["家具家电", "冰箱"]
    assert body["entries"][0]["project_name"] == "新房装修"

    body = await _search(client, "插座高度")
    assert body["entries"][0]["id"] == unfiled_id
    assert body["entries"][0]["node_id"] is None
    assert body["entries"][0]["node_path"] == []


@pytest.mark.asyncio
async def test_entry_sources_limited_to_three_and_counts(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    entry_id, first_source_id, _ = await _accepted_entry(
        client,
        db,
        title="橱柜五金清单",
        content="铰链与拉篮规格汇总",
    )
    now = _naive_utc_now()
    extra_sources = []
    for index in range(3):
        source = Source(
            workspace_id=workspace_id,
            source_type="link",
            title=f"参考链接 {index}",
            content="橱柜五金参考",
            link_url=f"https://example.com/{index}",
        )
        source.created_at = now + timedelta(minutes=index + 1)
        db.add(source)
        await db.flush()
        db.add(EntrySource(entry_id=entry_id, source_id=source.id))
        extra_sources.append(source.id)
    await db.commit()

    body = await _search(client, "五金清单")
    assert len(body["entries"]) == 1
    hit = body["entries"][0]
    assert len(hit["sources"]) == 3
    assert {item["id"] for item in hit["sources"]} == {
        first_source_id,
        *extra_sources[:2],
    }

    counts = await _search(client, "橱柜五金")
    by_id = {item["id"]: item["entry_count"] for item in counts["sources"]}
    assert set(by_id) == set(extra_sources)
    assert all(count == 1 for count in by_id.values())

    first_counts = await _search(client, "铰链")
    assert first_counts["sources"][0]["id"] == first_source_id
    assert first_counts["sources"][0]["entry_count"] == 1


@pytest.mark.asyncio
async def test_results_ordered_desc_and_limited(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    now = _naive_utc_now()
    for index in range(55):
        entry = Entry(
            workspace_id=workspace_id,
            project_id=project["id"],
            entry_type="experience",
            title=f"批量记录 {index}",
            content="排序关键词占位",
            status="archived",
        )
        entry.created_at = now + timedelta(minutes=index)
        db.add(entry)
        source = Source(
            workspace_id=workspace_id,
            title=f"批量来源 {index}",
            source_type="text",
            content="来源关键词占位",
        )
        source.created_at = now + timedelta(minutes=index)
        db.add(source)
    await db.commit()

    entries = (await _search(client, "排序关键词"))["entries"]
    assert len(entries) == 50
    assert entries[0]["title"] == "批量记录 54"
    assert entries[-1]["title"] == "批量记录 5"

    sources = (await _search(client, "来源关键词"))["sources"]
    assert len(sources) == 50
    assert sources[0]["title"] == "批量来源 54"


@pytest.mark.asyncio
async def test_pending_candidates_and_non_archived_entries_excluded(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    source = await capture(client, source_type="text", content="候选提取占位正文")
    pending = Extraction(
        source_id=source["id"],
        workspace_id=workspace_id,
        status="pending_confirm",
        title="待确认候选关键词",
        content="不应出现在搜索结果",
        entry_type="experience",
    )
    db.add(pending)
    conflict = Entry(
        workspace_id=workspace_id,
        project_id=project["id"],
        entry_type="experience",
        title="冲突状态记录关键词",
        content="",
        status="conflict",
    )
    db.add(conflict)
    await db.commit()

    body = await _search(client, "关键词")
    assert body["entries"] == []
    assert body["sources"] == []


@pytest.mark.asyncio
async def test_project_filter_scopes_entries_and_sources(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project_a = await create_project(client, "新房装修")
    project_b = await create_project(client, "日本旅行")
    now = _naive_utc_now()
    project_a_source_ids: list[str] = []
    for index, project_id in enumerate([project_a["id"], project_b["id"]]):
        entry = Entry(
            workspace_id=workspace_id,
            project_id=project_id,
            entry_type="experience",
            title=f"瓷砖铺贴要点 {index}",
            content="关键词占位：防滑与留缝",
            status="archived",
        )
        entry.created_at = now + timedelta(minutes=index)
        db.add(entry)
        source = Source(
            workspace_id=workspace_id,
            project_id=project_id,
            source_type="text",
            title=f"铺贴参考 {index}",
            content="关键词占位：防滑与留缝",
        )
        source.created_at = now + timedelta(minutes=index)
        db.add(source)
        await db.flush()
        if project_id == project_a["id"]:
            project_a_source_ids.append(source.id)
    unassigned = Source(
        workspace_id=workspace_id,
        project_id=None,
        source_type="text",
        title="未分配来源",
        content="关键词占位：防滑与留缝",
    )
    unassigned.created_at = now + timedelta(minutes=99)
    db.add(unassigned)
    await db.commit()

    body = await _search(client, "防滑与留缝", project=project_a["id"])
    assert [item["project_id"] for item in body["entries"]] == [project_a["id"]]
    assert {item["id"] for item in body["sources"]} == set(project_a_source_ids)
    assert all(item["project_id"] == project_a["id"] for item in body["sources"])


@pytest.mark.asyncio
async def test_type_filter_scopes_entries_only(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client, "新房装修")
    now = _naive_utc_now()
    for index, entry_type in enumerate(["experience", "pitfall", "price"]):
        entry = Entry(
            workspace_id=workspace_id,
            project_id=project["id"],
            entry_type=entry_type,
            title=f"类型筛选记录 {entry_type}",
            content="关键词占位：石材选择",
            status="archived",
        )
        entry.created_at = now + timedelta(minutes=index)
        db.add(entry)
    source = Source(
        workspace_id=workspace_id,
        project_id=project["id"],
        source_type="text",
        title="来源命中",
        content="关键词占位：石材选择",
    )
    db.add(source)
    await db.commit()

    body = await _search(client, "石材选择", type="pitfall")
    assert [item["entry_type"] for item in body["entries"]] == ["pitfall"]
    assert [item["title"] for item in body["sources"]] == ["来源命中"]


@pytest.mark.asyncio
async def test_node_filter_excludes_subtree_entries(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client, "新房装修")
    parent = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "家电"},
    )
    assert parent.status_code == 201
    child = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "冰箱", "parent_id": parent.json()["id"]},
    )
    assert child.status_code == 201
    now = _naive_utc_now()
    for index, node_id in enumerate([parent.json()["id"], child.json()["id"]]):
        entry = Entry(
            workspace_id=workspace_id,
            project_id=project["id"],
            node_id=node_id,
            entry_type="experience",
            title=f"节点记录 {index}",
            content="关键词占位：散热预留",
            status="archived",
        )
        entry.created_at = now + timedelta(minutes=index)
        db.add(entry)
    await db.commit()

    body = await _search(
        client,
        "散热预留",
        project=project["id"],
        node=child.json()["id"],
    )
    assert [item["node_id"] for item in body["entries"]] == [child.json()["id"]]


@pytest.mark.asyncio
async def test_invalid_filter_parameters_rejected(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    async with db.begin():
        await create_account(db, "other", "other password")
    project = await create_project(client, "新房装修")
    node = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "冰箱"},
    )
    assert node.status_code == 201
    other_project = await client.post("/api/auth/login", json={
        "account": "other",
        "password": "other password",
    })
    assert other_project.status_code == 200
    foreign = await create_project(client, "别的项目")
    foreign_node = await client.post(
        f"/api/projects/{foreign['id']}/nodes",
        json={"name": "异项目节点"},
    )
    assert foreign_node.status_code == 201
    await client.post(
        "/api/auth/login",
        json={"account": "owner", "password": "correct horse battery"},
    )

    cases = [
        ({"project": foreign["id"]}, "invalid_project"),
        ({"type": "not-a-type"}, "invalid_type"),
        ({"node": node.json()["id"]}, "node_requires_project"),
        (
            {"project": project["id"], "node": foreign_node.json()["id"]},
            "node_project_mismatch",
        ),
    ]
    for params, code in cases:
        response = await client.get("/api/search", params={"q": "关键词", **params})
        assert response.status_code == 422, (params, response.text)
        assert response.json()["detail"]["code"] == code, params
