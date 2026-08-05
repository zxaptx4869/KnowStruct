import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Entry, EntrySource, Extraction, Project
from app.services.accounts import create_account
from app.services.task_worker import process_next_task
from tests.fakes import FakeAIProvider
from tests.test_inbox_api import capture, create_project, login_owner


async def _ready_source(
    client: AsyncClient,
    db: AsyncSession,
) -> dict:
    source = await capture(client, source_type="text", content="零嵌冰箱散热方式\n底部散热更省空间")
    await process_next_task(db, FakeAIProvider())
    return (await client.get(f"/api/inbox/sources/{source['id']}")).json()


@pytest.mark.asyncio
async def test_accept_creates_traceable_entry(
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
    extraction = detail["extractions"][0]

    response = await client.post(
        f"/api/inbox/sources/{detail['id']}/extractions/{extraction['id']}/decide",
        json={
            "decision": "accepted",
            "project_id": project["id"],
            "node_id": node.json()["id"],
            "title": "散热方式决定侧边预留",
            "content": "零嵌冰箱需要先确认散热方式，再决定预留尺寸。",
            "entry_type": "pitfall",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["decision"] == "accepted"
    assert body["entry"]["project_id"] == project["id"]
    assert body["entry"]["node_id"] == node.json()["id"]
    assert body["entry"]["title"] == "散热方式决定侧边预留"

    linked = await db.scalar(
        select(EntrySource).where(EntrySource.entry_id == body["entry"]["id"])
    )
    assert linked is not None and linked.source_id == detail["id"]

    detail_after = (await client.get(f"/api/inbox/sources/{detail['id']}")).json()
    assert detail_after["candidates"]["accepted"] == 1
    assert detail_after["processing_state"] == "pending_confirm"


@pytest.mark.asyncio
async def test_accept_without_project_is_blocked(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    detail = await _ready_source(client, db)
    extraction = detail["extractions"][0]
    response = await client.post(
        f"/api/inbox/sources/{detail['id']}/extractions/{extraction['id']}/decide",
        json={"decision": "accepted"},
    )
    assert response.status_code == 422
    stored = await db.scalar(select(Extraction).where(Extraction.id == extraction["id"]))
    assert stored is not None and stored.status == "pending_confirm"
    assert await db.scalar(select(func.count(Entry.id))) == 0


@pytest.mark.asyncio
async def test_accept_node_from_another_project_is_blocked(
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
    extraction = detail["extractions"][0]

    response = await client.post(
        f"/api/inbox/sources/{detail['id']}/extractions/{extraction['id']}/decide",
        json={
            "decision": "accepted",
            "project_id": project_a["id"],
            "node_id": node_b.json()["id"],
        },
    )
    assert response.status_code == 409
    assert await db.scalar(select(func.count(Entry.id))) == 0
    stored = await db.scalar(select(Extraction).where(Extraction.id == extraction["id"]))
    assert stored.status == "pending_confirm"


@pytest.mark.asyncio
async def test_reject_creates_no_entry(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    detail = await _ready_source(client, db)
    extraction = detail["extractions"][0]
    response = await client.post(
        f"/api/inbox/sources/{detail['id']}/extractions/{extraction['id']}/decide",
        json={"decision": "rejected"},
    )
    assert response.status_code == 200
    assert response.json()["entry"] is None
    assert await db.scalar(select(func.count(Entry.id))) == 0


@pytest.mark.asyncio
async def test_resubmit_same_decision_is_idempotent(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    detail = await _ready_source(client, db)
    extraction = detail["extractions"][0]
    payload = {
        "decision": "accepted",
        "project_id": project["id"],
    }
    first = await client.post(
        f"/api/inbox/sources/{detail['id']}/extractions/{extraction['id']}/decide",
        json=payload,
    )
    second = await client.post(
        f"/api/inbox/sources/{detail['id']}/extractions/{extraction['id']}/decide",
        json=payload,
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["entry"]["id"] == second.json()["entry"]["id"]
    assert await db.scalar(select(func.count(Entry.id))) == 1

    conflict = await client.post(
        f"/api/inbox/sources/{detail['id']}/extractions/{extraction['id']}/decide",
        json={"decision": "rejected"},
    )
    assert conflict.status_code == 409


@pytest.mark.asyncio
async def test_complete_requires_all_candidates_decided(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    detail = await _ready_source(client, db)

    blocked = await client.post(f"/api/inbox/sources/{detail['id']}/complete")
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["pending_count"] == 2

    for extraction in detail["extractions"]:
        response = await client.post(
            f"/api/inbox/sources/{detail['id']}/extractions/{extraction['id']}/decide",
            json={
                "decision": "accepted" if extraction["id"] == detail["extractions"][0]["id"] else "rejected",
                "project_id": project["id"],
            },
        )
        assert response.status_code == 200

    done = (await client.post(f"/api/inbox/sources/{detail['id']}/complete")).json()
    assert done == {
        "total": 2,
        "pending_confirm": 0,
        "accepted": 1,
        "rejected": 1,
        "completed": True,
    }


@pytest.mark.asyncio
async def test_other_workspace_confirmation_is_hidden(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    detail = await _ready_source(client, db)

    async with db.begin():
        other = await create_account(db, "other", "another valid password")
        other_workspace_id = other.workspace.id

    hidden_source = await db.scalar(
        select(Extraction).where(Extraction.source_id == detail["id"])
    )
    assert hidden_source is not None

    hidden_project = Project(workspace_id=other_workspace_id, name="他人项目")
    db.add(hidden_project)
    await db.flush()
    hidden_project_id = hidden_project.id
    await db.commit()

    response = await client.post(
        f"/api/inbox/sources/{detail['id']}/extractions/{hidden_source.id}/decide",
        json={"decision": "accepted", "project_id": hidden_project_id},
    )
    assert response.status_code == 404
