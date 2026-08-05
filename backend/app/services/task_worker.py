"""In-process processing task worker backed by the MySQL task table."""

import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AIProvider, get_ai_provider
from app.config import get_settings
from app.database import AsyncSessionFactory
from app.models import ProcessingTask, Source, TaskStage, TaskStatus
from app.services.inbox import (
    process_source_extraction,
    process_source_ocr,
    utc_now,
)

logger = logging.getLogger(__name__)


async def claim_next_task(db: AsyncSession) -> ProcessingTask | None:
    """乐观领取最旧的待处理任务；未领取成功返回 None。"""
    task = await db.scalar(
        select(ProcessingTask)
        .where(ProcessingTask.status == TaskStatus.PENDING.value)
        .order_by(ProcessingTask.created_at, ProcessingTask.id)
        .limit(1)
    )
    if task is None:
        return None
    result = await db.execute(
        update(ProcessingTask)
        .where(
            ProcessingTask.id == task.id,
            ProcessingTask.status == TaskStatus.PENDING.value,
        )
        .values(status=TaskStatus.RUNNING.value, claimed_at=utc_now())
    )
    if result.rowcount != 1:
        await db.rollback()
        return None
    await db.commit()
    return task


async def recover_stale_tasks(db: AsyncSession, stale_seconds: int) -> int:
    """把超时未完成的 running 任务重置回 pending（容忍 worker 崩溃）。"""
    cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(
        seconds=stale_seconds
    )
    result = await db.execute(
        update(ProcessingTask)
        .where(
            ProcessingTask.status == TaskStatus.RUNNING.value,
            ProcessingTask.claimed_at < cutoff,
        )
        .values(
            status=TaskStatus.PENDING.value,
            claimed_at=None,
        )
    )
    await db.commit()
    return result.rowcount or 0


async def process_next_task(
    db: AsyncSession,
    provider: AIProvider | None = None,
) -> bool:
    """处理至多一个任务；返回是否处理了任务。"""
    task = await claim_next_task(db)
    if task is None:
        return False
    task_id = task.id
    source_id = task.source_id
    source = await db.get(Source, task.source_id)
    if source is None:
        await db.delete(task)
        await db.commit()
        return True
    try:
        provider = provider or await get_ai_provider(db, source.workspace_id)
        if task.stage == TaskStage.OCR.value:
            await process_source_ocr(db, source, task, provider)
            await db.commit()  # OCR 结果先持久化，提取失败重试不重跑 OCR
            await process_source_extraction(db, source, task, provider)
            await db.commit()
        else:
            await process_source_extraction(db, source, task, provider)
            await db.commit()
        logger.info("source %s processing succeeded", source_id)
    except Exception as exc:  # noqa: BLE001 - 任何失败都落库并可重试
        await db.rollback()
        failed_task = await db.get(ProcessingTask, task_id)
        if failed_task is not None:
            failed_task.status = TaskStatus.FAILED.value
            failed_task.last_error = str(exc)[:2000]
            failed_task.finished_at = utc_now()
            await db.commit()
        logger.warning("source %s processing failed: %s", source_id, exc)
    return True


async def run_task_worker() -> None:
    """进程内队列 worker：常驻循环，随应用 lifespan 启停。"""
    settings = get_settings()
    last_recovery = 0.0
    while True:
        try:
            async with AsyncSessionFactory() as db:
                now_monotonic = time.monotonic()
                if now_monotonic - last_recovery >= 30:
                    await recover_stale_tasks(db, settings.TASK_STALE_SECONDS)
                    last_recovery = now_monotonic
                processed = await process_next_task(db)
            if not processed:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("task worker iteration failed")
            await asyncio.sleep(2)
