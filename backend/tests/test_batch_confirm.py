import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Entry, EntrySource, Extraction, Source
from app.services.accounts import create_account
from app.services.task_worker import process_next_task
from tests.fakes import FakeAIProvider, make_candidate
from tests.test_inbox_api import capture, create_project, login_owner


async def _ready_source(
    client: AsyncClient,
    db: AsyncSession,
    *,
    content: str = "零嵌冰箱散热方式\n底部散热更省空间",
    provider: FakeAIProvider | None = None,
) -> dict:
    source = await capture(client, source_type="text", content=content)
    await process_next_task(db, provider or FakeAIProvider())
    return (await client.get(f"/api/inbox/sources/{source['id']}")).json()


@pytest.mark.asyncio
async def test_batch_confirm_creates_traceable_entries(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    first = await _ready_source(client, db, content="第一条经验内容")
    second = await _ready_source(client, db, content="第二条经验内容")

    response = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={
            "source_ids": [first["id"], second["id"]],
            "project_id": project["id"],
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "confirmed_sources": 2,
        "entries_created": 4,
        "skipped_low_confidence": 0,
    }

    assert await db.scalar(select(func.count(Entry.id))) == 4
    linked = await db.scalars(select(EntrySource))
    assert len(list(linked)) == 4
    sources = {
        item.id: item
        for item in (
            await db.scalars(select(Source).where(Source.id.in_([first["id"], second["id"]])))
        ).all()
    }
    assert sources[first["id"]].project_id == project["id"]
    assert sources[second["id"]].project_id == project["id"]

    extractions = (
        await db.scalars(
            select(Extraction).where(
                Extraction.source_id.in_([first["id"], second["id"]])
            )
        )
    ).all()
    assert all(item.status == "accepted" for item in extractions)
    listed = (await client.get("/api/inbox/sources")).json()
    assert all(item["processing_state"] == "done" for item in listed)


@pytest.mark.asyncio
async def test_batch_confirm_with_node(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    node = await client.post(
        f"/api/projects/{project['id']}/nodes",
        json={"name": "冰箱"},
    )
    assert node.status_code == 201
    detail = await _ready_source(client, db)

    response = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={
            "source_ids": [detail["id"]],
            "project_id": project["id"],
            "node_id": node.json()["id"],
        },
    )
    assert response.status_code == 200
    assert response.json()["entries_created"] == 2
    entries = (await db.scalars(select(Entry))).all()
    assert all(entry.node_id == node.json()["id"] for entry in entries)


@pytest.mark.asyncio
async def test_batch_confirm_skips_low_confidence(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    provider = FakeAIProvider(
        candidates=[
            make_candidate(title="低置信度候选", confidence=0.5),
            make_candidate(title="高置信度候选", confidence=0.9),
        ]
    )
    detail = await _ready_source(client, db, provider=provider)

    response = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={"source_ids": [detail["id"]], "project_id": project["id"]},
    )
    assert response.status_code == 200
    assert response.json() == {
        "confirmed_sources": 1,
        "entries_created": 1,
        "skipped_low_confidence": 1,
    }
    assert await db.scalar(select(func.count(Entry.id))) == 1

    extractions = {
        item.title: item
        for item in (
            await db.scalars(select(Extraction).where(Extraction.source_id == detail["id"]))
        ).all()
    }
    assert extractions["低置信度候选"].status == "pending_confirm"
    assert extractions["高置信度候选"].status == "accepted"
    after = (await client.get(f"/api/inbox/sources/{detail['id']}")).json()
    assert after["processing_state"] == "pending_confirm"
    assert after["candidates"]["pending_confirm"] == 1


@pytest.mark.asyncio
async def test_batch_confirm_requires_project(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    detail = await _ready_source(client, db)
    response = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={"source_ids": [detail["id"]]},
    )
    assert response.status_code == 422
    assert await db.scalar(select(func.count(Entry.id))) == 0


@pytest.mark.asyncio
async def test_batch_confirm_rejects_foreign_node(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project_a = await create_project(client, "项目A")
    project_b = await create_project(client, "项目B")
    node_b = await client.post(
        f"/api/projects/{project_b['id']}/nodes",
        json={"name": "冰箱"},
    )
    detail = await _ready_source(client, db)

    response = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={
            "source_ids": [detail["id"]],
            "project_id": project_a["id"],
            "node_id": node_b.json()["id"],
        },
    )
    assert response.status_code == 409
    assert await db.scalar(select(func.count(Entry.id))) == 0


@pytest.mark.asyncio
async def test_batch_confirm_rejects_non_pending_source(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    pending = await _ready_source(client, db, content="待确认内容")
    decided = await _ready_source(client, db, content="已决定内容")
    for extraction in decided["extractions"]:
        accepted = await client.post(
            f"/api/inbox/sources/{decided['id']}/extractions/{extraction['id']}/decide",
            json={"decision": "accepted", "project_id": project["id"]},
        )
        assert accepted.status_code == 200

    response = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={
            "source_ids": [pending["id"], decided["id"]],
            "project_id": project["id"],
        },
    )
    assert response.status_code == 409
    body = response.json()
    assert body["detail"]["code"] == "source_not_pending_confirm"
    assert body["detail"]["blocker_count"] == 1
    assert await db.scalar(select(func.count(Entry.id))) == 2
    stored = await db.scalar(select(Extraction).where(Extraction.id == pending["extractions"][0]["id"]))
    assert stored is not None and stored.status == "pending_confirm"


@pytest.mark.asyncio
async def test_batch_confirm_rejects_source_without_confirmable(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    provider = FakeAIProvider(
        candidates=[make_candidate(title="唯一候选", confidence=0.3)]
    )
    detail = await _ready_source(client, db, provider=provider)

    response = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={"source_ids": [detail["id"]], "project_id": project["id"]},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "source_without_confirmable_candidates"
    assert await db.scalar(select(func.count(Entry.id))) == 0


@pytest.mark.asyncio
async def test_batch_confirm_rejects_foreign_source(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    detail = await _ready_source(client, db)
    async with db.begin():
        other = await create_account(db, "other", "another valid password")
        hidden = Source(
            workspace_id=other.workspace.id,
            source_type="text",
            title="其他工作区来源",
            content="隐藏内容",
            content_status="saved",
        )
        db.add(hidden)
        await db.flush()
        hidden_id = hidden.id

    response = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={
            "source_ids": [detail["id"], hidden_id],
            "project_id": project["id"],
        },
    )
    assert response.status_code == 404
    assert await db.scalar(select(func.count(Entry.id))) == 0


@pytest.mark.asyncio
async def test_batch_confirm_rejects_empty_and_oversized(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    empty = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={"source_ids": [], "project_id": project["id"]},
    )
    assert empty.status_code == 422

    oversized = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={
            "source_ids": [f"id-{index}" for index in range(101)],
            "project_id": project["id"],
        },
    )
    assert oversized.status_code == 422


@pytest.mark.asyncio
async def test_batch_confirm_rejects_too_many_candidates(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    candidates = [
        make_candidate(title=f"候选 {index}", confidence=0.9)
        for index in range(250)
    ]
    detail = await _ready_source(
        client,
        db,
        content="超大候选量内容",
        provider=FakeAIProvider(candidates=candidates),
    )

    response = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={"source_ids": [detail["id"]], "project_id": project["id"]},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "too_many_candidates"
    assert await db.scalar(select(func.count(Entry.id))) == 0


@pytest.mark.asyncio
async def test_batch_confirm_atomic_no_partial_entries(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    valid = await _ready_source(client, db, content="正常内容")
    invalid = await _ready_source(
        client,
        db,
        content="全低置信度内容",
        provider=FakeAIProvider(
            candidates=[make_candidate(title="低置信度", confidence=0.2)]
        ),
    )

    response = await client.post(
        "/api/inbox/sources/batch/confirm",
        json={
            "source_ids": [valid["id"], invalid["id"]],
            "project_id": project["id"],
        },
    )
    assert response.status_code == 409
    assert await db.scalar(select(func.count(Entry.id))) == 0
    stored = await db.scalar(select(Extraction).where(Extraction.id == valid["extractions"][0]["id"]))
    assert stored is not None and stored.status == "pending_confirm"


@pytest.mark.asyncio
async def test_batch_confirm_duplicate_submission_conflicts(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    detail = await _ready_source(client, db)
    payload = {
        "source_ids": [detail["id"]],
        "project_id": project["id"],
    }

    first = await client.post("/api/inbox/sources/batch/confirm", json=payload)
    assert first.status_code == 200
    second = await client.post("/api/inbox/sources/batch/confirm", json=payload)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "source_not_pending_confirm"
    assert await db.scalar(select(func.count(Entry.id))) == 2
