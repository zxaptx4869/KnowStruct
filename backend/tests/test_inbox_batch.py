import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Entry,
    EntrySource,
    ProcessingTask,
    Project,
    Source,
    SourceAttachment,
    TaskStatus,
)
from app.services.accounts import create_account
from app.services.storage import LocalAttachmentStorage
from tests.test_image_upload import make_png, upload_image
from tests.test_inbox_api import capture, create_project, login_owner


async def add_entry_reference(
    db: AsyncSession,
    *,
    workspace_id: str,
    project_id: str,
    source_id: str,
) -> str:
    async with db.begin():
        entry = Entry(
            workspace_id=workspace_id,
            project_id=project_id,
            entry_type="experience",
            title="测试正式记录",
            content="引用该来源的正式内容",
            status="archived",
        )
        db.add(entry)
        await db.flush()
        db.add(EntrySource(entry_id=entry.id, source_id=source_id))
    return entry.id


async def mark_tasks_failed(db: AsyncSession, source_ids: list[str]) -> None:
    async with db.begin():
        tasks = (
            await db.scalars(
                select(ProcessingTask).where(
                    ProcessingTask.source_id.in_(source_ids)
                )
            )
        ).all()
        for task in tasks:
            task.status = TaskStatus.FAILED.value
            task.last_error = "simulated failure"
            task.finished_at = None


async def mark_task_running(db: AsyncSession, source_id: str) -> None:
    async with db.begin():
        task = await db.scalar(
            select(ProcessingTask).where(ProcessingTask.source_id == source_id)
        )
        assert task is not None
        task.status = TaskStatus.RUNNING.value


@pytest.mark.asyncio
async def test_batch_assign_unassigned_sources(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    first = await capture(client, source_type="text", content="第一条经验")
    second = await capture(client, source_type="text", content="第二条经验")

    response = await client.post(
        "/api/inbox/sources/batch/assign",
        json={
            "source_ids": [first["id"], second["id"]],
            "project_id": project["id"],
        },
    )
    assert response.status_code == 200
    assert response.json() == {"assigned": 2}

    listed = (await client.get("/api/inbox/sources")).json()
    by_id = {item["id"]: item for item in listed}
    assert by_id[first["id"]]["project_id"] == project["id"]
    assert by_id[first["id"]]["project_name"] == project["name"]
    assert by_id[second["id"]]["project_id"] == project["id"]


@pytest.mark.asyncio
async def test_batch_assign_rejects_already_assigned(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    assigned = await capture(
        client,
        source_type="text",
        content="已分配内容",
        project_id=project["id"],
    )
    unassigned = await capture(client, source_type="text", content="未分配内容")

    response = await client.post(
        "/api/inbox/sources/batch/assign",
        json={
            "source_ids": [assigned["id"], unassigned["id"]],
            "project_id": project["id"],
        },
    )
    assert response.status_code == 409
    body = response.json()
    assert body["detail"]["blocker_count"] == 1
    stored = await db.scalar(select(Source).where(Source.id == unassigned["id"]))
    assert stored is not None
    assert stored.project_id is None


@pytest.mark.asyncio
async def test_batch_assign_rejects_referenced_source(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    source = await capture(client, source_type="text", content="被引用内容")
    await add_entry_reference(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
        source_id=source["id"],
    )

    response = await client.post(
        "/api/inbox/sources/batch/assign",
        json={"source_ids": [source["id"]], "project_id": project["id"]},
    )
    assert response.status_code == 409
    stored = await db.scalar(select(Source).where(Source.id == source["id"]))
    assert stored is not None
    assert stored.project_id is None


@pytest.mark.asyncio
async def test_batch_assign_rejects_foreign_project(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(client, source_type="text", content="内容")
    async with db.begin():
        other = await create_account(db, "other", "another valid password")
        hidden = Project(workspace_id=other.workspace.id, name="其他项目")
        db.add(hidden)
        await db.flush()
        hidden_id = hidden.id

    response = await client.post(
        "/api/inbox/sources/batch/assign",
        json={"source_ids": [source["id"]], "project_id": hidden_id},
    )
    assert response.status_code == 404
    stored = await db.scalar(select(Source).where(Source.id == source["id"]))
    assert stored is not None
    assert stored.project_id is None


@pytest.mark.asyncio
async def test_batch_rejects_empty_and_oversized_requests(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    empty = await client.post(
        "/api/inbox/sources/batch/assign",
        json={"source_ids": [], "project_id": "project-id"},
    )
    assert empty.status_code == 422

    oversized = await client.post(
        "/api/inbox/sources/batch/retry",
        json={"source_ids": [f"id-{index}" for index in range(101)]},
    )
    assert oversized.status_code == 422


@pytest.mark.asyncio
async def test_batch_delete_unreferenced_sources(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    first = await capture(client, source_type="text", content="第一条")
    second = await capture(client, source_type="link", link_url="https://example.com/x", content="链接说明")

    response = await client.post(
        "/api/inbox/sources/batch/delete",
        json={"source_ids": [first["id"], second["id"]]},
    )
    assert response.status_code == 200
    assert response.json() == {"deleted": 2}
    assert (await client.get("/api/inbox/sources")).json() == []
    task_count = await db.scalar(select(func.count(ProcessingTask.id)))
    assert task_count == 0
    source_count = await db.scalar(select(func.count(Source.id)))
    assert source_count == 0


@pytest.mark.asyncio
async def test_batch_delete_image_cleans_attachments(
    client: AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await login_owner(client, db)
    response = await upload_image(client, note="重复图片")
    assert response.status_code == 201
    source = response.json()

    deleted_keys: list[str] = []
    original_delete = LocalAttachmentStorage.delete

    async def record_delete(self, **kwargs: object) -> None:
        deleted_keys.append(str(kwargs["object_key"]))
        await original_delete(self, **kwargs)

    monkeypatch.setattr(LocalAttachmentStorage, "delete", record_delete)

    delete_response = await client.post(
        "/api/inbox/sources/batch/delete",
        json={"source_ids": [source["id"]]},
    )
    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": 1}
    assert len(deleted_keys) == 1
    attachment_count = await db.scalar(
        select(func.count(SourceAttachment.id)).where(
            SourceAttachment.source_id == source["id"]
        )
    )
    assert attachment_count == 0


@pytest.mark.asyncio
async def test_batch_delete_blocks_referenced_source(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    workspace_id = await login_owner(client, db)
    project = await create_project(client)
    source = await capture(client, source_type="text", content="被引用内容")
    await add_entry_reference(
        db,
        workspace_id=workspace_id,
        project_id=project["id"],
        source_id=source["id"],
    )

    response = await client.post(
        "/api/inbox/sources/batch/delete",
        json={"source_ids": [source["id"]]},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["blocker_count"] == 1
    stored = await db.scalar(select(Source).where(Source.id == source["id"]))
    assert stored is not None


@pytest.mark.asyncio
async def test_batch_delete_blocks_running_task(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(client, source_type="text", content="处理中内容")
    await mark_task_running(db, source["id"])

    response = await client.post(
        "/api/inbox/sources/batch/delete",
        json={"source_ids": [source["id"]]},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["blocker_count"] == 1
    stored = await db.scalar(select(Source).where(Source.id == source["id"]))
    assert stored is not None
    task = await db.scalar(
        select(ProcessingTask).where(ProcessingTask.source_id == source["id"])
    )
    assert task is not None
    assert task.status == TaskStatus.RUNNING.value


@pytest.mark.asyncio
async def test_batch_delete_second_request_not_found(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(client, source_type="text", content="待删除")
    first = await client.post(
        "/api/inbox/sources/batch/delete",
        json={"source_ids": [source["id"]]},
    )
    assert first.status_code == 200
    second = await client.post(
        "/api/inbox/sources/batch/delete",
        json={"source_ids": [source["id"]]},
    )
    assert second.status_code == 404


@pytest.mark.asyncio
async def test_batch_retry_failed_sources(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    first = await capture(client, source_type="text", content="失败一")
    second = await capture(client, source_type="text", content="失败二")
    await mark_tasks_failed(db, [first["id"], second["id"]])

    response = await client.post(
        "/api/inbox/sources/batch/retry",
        json={"source_ids": [first["id"], second["id"]]},
    )
    assert response.status_code == 200
    assert response.json() == {"retried": 2}

    tasks = (
        await db.scalars(
            select(ProcessingTask).where(
                ProcessingTask.source_id.in_([first["id"], second["id"]])
            )
        )
    ).all()
    assert all(task.status == TaskStatus.PENDING.value for task in tasks)
    assert all(task.attempt_count == 2 for task in tasks)
    assert all(task.last_error is None for task in tasks)


@pytest.mark.asyncio
async def test_batch_retry_rejects_non_failed(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    failed = await capture(client, source_type="text", content="失败内容")
    pending = await capture(client, source_type="text", content="待处理内容")
    await mark_tasks_failed(db, [failed["id"]])

    response = await client.post(
        "/api/inbox/sources/batch/retry",
        json={"source_ids": [failed["id"], pending["id"]]},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["blocker_count"] == 1
    failed_task = await db.scalar(
        select(ProcessingTask).where(ProcessingTask.source_id == failed["id"])
    )
    assert failed_task is not None
    assert failed_task.status == TaskStatus.FAILED.value


@pytest.mark.asyncio
async def test_duplicate_link_capture_hints_and_lists(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    first = await capture(
        client,
        source_type="link",
        link_url="https://example.com/product/123",
        content="洗烘套装参数页",
    )
    second = await capture(
        client,
        source_type="link",
        link_url="https://example.com/product/123",
        content="洗烘套装参数页（重复）",
    )
    assert second["duplicate_of"]["id"] == first["id"]
    assert second["duplicate_of"]["title"] == "洗烘套装参数页"
    assert first["duplicate_of"] is None

    listed = (await client.get("/api/inbox/sources")).json()
    by_id = {item["id"]: item for item in listed}
    assert by_id[first["id"]]["duplicate_of"] is None
    assert by_id[second["id"]]["duplicate_of"]["id"] == first["id"]


@pytest.mark.asyncio
async def test_duplicate_text_whitespace_normalized(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    first = await capture(client, source_type="text", content="  零嵌冰箱\n要看底部散热  ")
    second = await capture(client, source_type="text", content="零嵌冰箱 要看底部散热")
    assert second["duplicate_of"]["id"] == first["id"]


@pytest.mark.asyncio
async def test_link_fragment_ignored_but_query_preserved(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    first = await capture(
        client,
        source_type="link",
        link_url="https://Example.com/path#section",
        content="原始链接",
    )
    fragment = await capture(
        client,
        source_type="link",
        link_url="https://example.com/path",
        content="仅 fragment 不同",
    )
    assert fragment["duplicate_of"]["id"] == first["id"]

    query = await capture(
        client,
        source_type="link",
        link_url="https://example.com/path?utm_source=wechat",
        content="查询参数不同",
    )
    assert query["duplicate_of"] is None


@pytest.mark.asyncio
async def test_duplicate_image_file_detected(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    first = await upload_image(client, note="第一张")
    assert first.status_code == 201
    first_source = first.json()

    second = await upload_image(client, note="重复图片")
    assert second.status_code == 201
    assert second.json()["duplicate_of"]["id"] == first_source["id"]

    different = await upload_image(
        client,
        files=[("other.png", "image/png", make_png(width=201))],
        note="不同图片",
    )
    assert different.status_code == 201
    assert different.json()["duplicate_of"] is None


@pytest.mark.asyncio
async def test_duplicate_detection_isolated_per_workspace(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    await capture(client, source_type="text", content="同一段文字")

    async with db.begin():
        await create_account(db, "other", "another valid password")
    login = await client.post(
        "/api/auth/login",
        json={"account": "other", "password": "another valid password"},
    )
    assert login.status_code == 200
    captured = await capture(client, source_type="text", content="同一段文字")
    assert captured["duplicate_of"] is None


@pytest.mark.asyncio
async def test_fingerprint_failure_degrades_gracefully(
    client: AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await login_owner(client, db)
    from app.services import inbox as inbox_service

    monkeypatch.setattr(inbox_service, "text_fingerprint", lambda _content: None)
    response = await client.post(
        "/api/inbox/sources",
        json={"source_type": "text", "content": "指纹失败也不影响采集"},
    )
    assert response.status_code == 201
    assert response.json()["duplicate_of"] is None
    assert response.json()["id"]


@pytest.mark.asyncio
async def test_batch_assign_foreign_source_not_found(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    project = await create_project(client)
    async with db.begin():
        other = await create_account(db, "other", "another valid password")
        foreign_source = Source(
            workspace_id=other.workspace.id,
            source_type="text",
            title="外部资料",
            content="外部内容",
            content_status="saved",
        )
        db.add(foreign_source)
        await db.flush()
        foreign_id = foreign_source.id

    response = await client.post(
        "/api/inbox/sources/batch/assign",
        json={"source_ids": [foreign_id], "project_id": project["id"]},
    )
    assert response.status_code == 404
