from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProviderError
from app.models import Extraction, ProcessingTask, Source, TaskStatus
from app.services.task_worker import process_next_task, recover_stale_tasks
from tests.fakes import FakeAIProvider
from tests.test_inbox_api import capture, login_owner


async def _run(db: AsyncSession, provider: FakeAIProvider) -> bool:
    return await process_next_task(db, provider)


@pytest.mark.asyncio
async def test_failed_task_keeps_source_and_marks_failed(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(client, source_type="text", content="零嵌冰箱散热方式")
    processed = await _run(db, FakeAIProvider(error=AIProviderError("模拟 AI 失败")))
    assert processed is True

    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["processing_state"] == "failed"
    assert detail["task"]["status"] == "failed"
    assert "模拟 AI 失败" in detail["task"]["last_error"]
    assert detail["extractions"] == []

    stored = await db.scalar(select(Source).where(Source.id == source["id"]))
    assert stored is not None


@pytest.mark.asyncio
async def test_retry_does_not_duplicate_source_or_candidates(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(client, source_type="text", content="零嵌冰箱散热方式")
    await _run(db, FakeAIProvider(error=AIProviderError("首次失败")))

    retry = await client.post(f"/api/inbox/sources/{source['id']}/retry")
    assert retry.status_code == 200
    assert retry.json()["processing_state"] == "processing"
    assert retry.json()["task"]["attempt_count"] == 2

    await _run(db, FakeAIProvider())
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["processing_state"] == "pending_confirm"
    assert len(detail["extractions"]) == 2
    assert detail["task"]["status"] == "succeeded"

    source_count = await db.scalar(select(func.count(Source.id)))
    extraction_count = await db.scalar(select(func.count(Extraction.id)))
    assert source_count == 1
    assert extraction_count == 2


@pytest.mark.asyncio
async def test_retry_rejected_when_not_failed(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(client, source_type="text", content="零嵌冰箱散热方式")
    pending_retry = await client.post(f"/api/inbox/sources/{source['id']}/retry")
    assert pending_retry.status_code == 409

    await _run(db, FakeAIProvider())
    succeeded_retry = await client.post(f"/api/inbox/sources/{source['id']}/retry")
    assert succeeded_retry.status_code == 409


@pytest.mark.asyncio
async def test_processing_updates_source_title_from_first_candidate(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(
        client,
        source_type="text",
        content="零嵌冰箱要看底部散热\n第二条内容",
    )
    assert source["title"] == "零嵌冰箱要看底部散热"

    processed = await _run(db, FakeAIProvider())
    assert processed is True

    stored = await db.scalar(select(Source).where(Source.id == source["id"]))
    assert stored is not None
    assert stored.title == "零嵌冰箱散热方式"


@pytest.mark.asyncio
async def test_already_claimed_task_is_not_processed_twice(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(client, source_type="text", content="领取互斥内容")
    provider = FakeAIProvider()
    task = await db.scalar(select(ProcessingTask).where(ProcessingTask.source_id == source["id"]))
    assert task is not None
    task.status = TaskStatus.RUNNING.value
    task.claimed_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()

    processed = await process_next_task(db, provider)
    assert processed is False
    assert provider.calls == []
    task = await db.scalar(select(ProcessingTask).where(ProcessingTask.source_id == source["id"]))
    assert task is not None and task.status == TaskStatus.RUNNING.value


@pytest.mark.asyncio
async def test_stale_running_task_is_recovered(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(client, source_type="text", content="陈旧任务恢复")
    task = await db.scalar(select(ProcessingTask).where(ProcessingTask.source_id == source["id"]))
    assert task is not None
    task.status = TaskStatus.RUNNING.value
    task.claimed_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=30)
    await db.commit()

    recovered = await recover_stale_tasks(db, 600)
    assert recovered == 1
    await _run(db, FakeAIProvider())

    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert detail["task"]["status"] == "succeeded"


@pytest.mark.asyncio
async def test_extraction_order_matches_provider_output(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    await login_owner(client, db)
    source = await capture(client, source_type="text", content="候选顺序验证")
    await _run(db, FakeAIProvider())
    detail = (await client.get(f"/api/inbox/sources/{source['id']}")).json()
    assert [item["title"] for item in detail["extractions"]] == [
        "零嵌冰箱散热方式",
        "底部散热型号的安装余量",
    ]
