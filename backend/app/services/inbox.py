"""Workspace-scoped capture inbox and processing task operations."""

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProvider, AIProviderError
from app.api.errors import ConflictError, ResourceNotFoundError
from app.models import (
    Extraction,
    ProcessingTask,
    Project,
    Source,
    SourceAttachment,
    SourceContentStatus,
    SourceType,
    TaskStage,
    TaskStatus,
)
from app.schemas.inbox import CandidateCounts, SourceCreate
from app.services.ocr import prepare_ocr_image, run_ocr_with_fallback
from app.services.projects import get_project
from app.services.storage import get_attachment_storage


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def derive_title(content: str) -> str:
    first_line = next(
        (line.strip() for line in content.splitlines() if line.strip()),
        "",
    )
    return (first_line or "未命名记录")[:100]


def derive_ocr_title(text: str) -> str:
    """从 OCR 文本生成标题：取首个非空且非"图 N"标记的行，优先使用冒号后的内容。"""
    line = text.strip()
    for candidate in (item.strip() for item in text.splitlines() if item.strip()):
        if re.fullmatch(r"图\s*\d+：?", candidate):
            continue
        line = candidate
        break
    if "：" in line:
        after_colon = line.split("：", 1)[1].strip()
        if after_colon:
            line = after_colon
    return line[:80] or "未命名记录"


async def create_source(
    db: AsyncSession,
    workspace_id: str,
    payload: SourceCreate,
) -> Source:
    project_id = None
    if payload.project_id:
        project = await get_project(db, workspace_id, payload.project_id)
        project_id = project.id
    source = Source(
        workspace_id=workspace_id,
        project_id=project_id,
        source_type=payload.source_type,
        title=derive_title(payload.content or ""),
        content=payload.content or "",
        link_url=payload.link_url if payload.source_type == SourceType.LINK.value else None,
    )
    db.add(source)
    await db.flush()
    db.add(
        ProcessingTask(
            source_id=source.id,
            workspace_id=workspace_id,
            stage=TaskStage.AI_EXTRACTION.value,
            status=TaskStatus.PENDING.value,
        )
    )
    await db.flush()
    return source


async def create_image_source(
    db: AsyncSession,
    workspace_id: str,
    *,
    project_id: str | None,
    note: str | None,
    files: list[tuple[str, str, bytes]],
) -> Source:
    """创建 image Source：先建行，再按序落盘附件，失败时清理不留下残片。"""
    if not files or len(files) > 3:
        raise ConflictError("invalid_image_batch", "图片数量必须在 1-3 张之间")
    resolved_project_id = None
    if project_id:
        project = await get_project(db, workspace_id, project_id)
        resolved_project_id = project.id

    title = derive_title(note or "")
    source = Source(
        workspace_id=workspace_id,
        project_id=resolved_project_id,
        source_type=SourceType.IMAGE.value,
        title=title,
        content=None,
        content_status=SourceContentStatus.SAVING.value,
    )
    db.add(source)
    await db.flush()

    storage = get_attachment_storage()
    saved_keys: list[str] = []
    try:
        for index, (filename, content_type, data) in enumerate(files):
            object_key, size = await storage.save(
                workspace_id=workspace_id,
                source_id=source.id,
                filename=filename,
                content_type=content_type,
                data=data,
            )
            saved_keys.append(object_key)
            db.add(
                SourceAttachment(
                    source_id=source.id,
                    workspace_id=workspace_id,
                    object_key=object_key,
                    filename=filename,
                    content_type=content_type,
                    size=size,
                    sort_order=index,
                )
            )
        source.content_status = SourceContentStatus.SAVED.value
        db.add(
            ProcessingTask(
                source_id=source.id,
                workspace_id=workspace_id,
                stage=TaskStage.OCR.value,
                status=TaskStatus.PENDING.value,
            )
        )
        await db.flush()
    except Exception:
        for object_key in saved_keys:
            await storage.delete(
                workspace_id=workspace_id,
                source_id=source.id,
                object_key=object_key,
            )
        raise
    return source


def derive_processing_state(
    task: ProcessingTask | None,
    counts: CandidateCounts,
) -> str:
    if task is None:
        return "processing"
    if task.status == TaskStatus.FAILED.value:
        return "failed"
    if task.status in {TaskStatus.PENDING.value, TaskStatus.RUNNING.value}:
        return "processing"
    if counts.pending_confirm > 0:
        return "pending_confirm"
    return "done"


@dataclass(frozen=True)
class SourceListItemData:
    source: Source
    project_name: str | None
    task: ProcessingTask | None
    counts: CandidateCounts
    attachments: list[SourceAttachment] = field(default_factory=list)


@dataclass(frozen=True)
class SourceDetailData(SourceListItemData):
    extractions: list[Extraction]
    attachments: list[SourceAttachment]


async def _load_attachments(
    db: AsyncSession,
    source_ids: list[str],
) -> dict[str, list[SourceAttachment]]:
    if not source_ids:
        return {}
    rows = (
        await db.scalars(
            select(SourceAttachment)
            .where(SourceAttachment.source_id.in_(source_ids))
            .order_by(SourceAttachment.sort_order, SourceAttachment.id)
        )
    ).all()
    grouped: dict[str, list[SourceAttachment]] = {}
    for attachment in rows:
        grouped.setdefault(attachment.source_id, []).append(attachment)
    return grouped


async def _load_tasks(
    db: AsyncSession,
    source_ids: list[str],
) -> dict[str, ProcessingTask]:
    if not source_ids:
        return {}
    tasks = (
        await db.scalars(
            select(ProcessingTask).where(ProcessingTask.source_id.in_(source_ids))
        )
    ).all()
    return {task.source_id: task for task in tasks}


async def _load_counts(
    db: AsyncSession,
    source_ids: list[str],
) -> dict[str, CandidateCounts]:
    if not source_ids:
        return {}
    rows = await db.execute(
        select(
            Extraction.source_id,
            Extraction.status,
            func.count(Extraction.id),
        )
        .where(Extraction.source_id.in_(source_ids))
        .group_by(Extraction.source_id, Extraction.status)
    )
    counts: dict[str, CandidateCounts] = {
        source_id: CandidateCounts() for source_id in source_ids
    }
    for source_id, status, count in rows.all():
        item = counts[source_id]
        if status == "pending_confirm":
            item.pending_confirm = int(count)
        elif status == "accepted":
            item.accepted = int(count)
        elif status == "rejected":
            item.rejected = int(count)
    return counts


async def list_sources(
    db: AsyncSession,
    workspace_id: str,
    *,
    state: str | None = None,
    source_type: str | None = None,
    project_id: str | None = None,
    q: str | None = None,
    limit: int = 200,
) -> list[SourceListItemData]:
    query = (
        select(Source, Project.name)
        .outerjoin(Project, Project.id == Source.project_id)
        .where(Source.workspace_id == workspace_id)
    )
    if source_type:
        query = query.where(Source.source_type == source_type)
    if project_id:
        query = query.where(Source.project_id == project_id)
    if q:
        keyword = f"%{q}%"
        query = query.where(
            or_(
                Source.title.like(keyword),
                Source.content.like(keyword),
                Source.link_url.like(keyword),
            )
        )
    query = query.order_by(Source.created_at.desc(), Source.id).limit(limit)
    rows = (await db.execute(query)).all()
    sources = [row[0] for row in rows]
    project_names = {row[0].id: row[1] for row in rows}
    tasks = await _load_tasks(db, [source.id for source in sources])
    counts = await _load_counts(db, [source.id for source in sources])
    attachments = await _load_attachments(db, [source.id for source in sources])

    items: list[SourceListItemData] = []
    for source in sources:
        task = tasks.get(source.id)
        source_counts = counts[source.id]
        if state and derive_processing_state(task, source_counts) != state:
            continue
        items.append(
            SourceListItemData(
                source=source,
                project_name=project_names[source.id],
                task=task,
                counts=source_counts,
                attachments=attachments.get(source.id, []),
            )
        )
    return items


async def get_source_detail(
    db: AsyncSession,
    workspace_id: str,
    source_id: str,
) -> SourceDetailData:
    row = await db.execute(
        select(Source, Project.name)
        .outerjoin(Project, Project.id == Source.project_id)
        .where(Source.id == source_id, Source.workspace_id == workspace_id)
    )
    found = row.first()
    if found is None:
        raise ResourceNotFoundError("source")
    source, project_name = found
    attachments = await _load_attachments(db, [source.id])
    task = await db.scalar(
        select(ProcessingTask).where(ProcessingTask.source_id == source.id)
    )
    extractions = list(
        (
            await db.scalars(
                select(Extraction)
                .where(Extraction.source_id == source.id)
                .order_by(
                    Extraction.created_at,
                    Extraction.sort_order,
                    Extraction.id,
                )
            )
        ).all()
    )
    counts = CandidateCounts()
    for extraction in extractions:
        if extraction.status == "pending_confirm":
            counts.pending_confirm += 1
        elif extraction.status == "accepted":
            counts.accepted += 1
        elif extraction.status == "rejected":
            counts.rejected += 1
    return SourceDetailData(
        source=source,
        project_name=project_name,
        task=task,
        counts=counts,
        extractions=extractions,
        attachments=attachments.get(source.id, []),
    )


async def retry_source_task(
    db: AsyncSession,
    workspace_id: str,
    source_id: str,
) -> Source:
    source = await db.scalar(
        select(Source).where(
            Source.id == source_id,
            Source.workspace_id == workspace_id,
        )
    )
    if source is None:
        raise ResourceNotFoundError("source")
    task = await db.scalar(
        select(ProcessingTask).where(ProcessingTask.source_id == source.id)
    )
    if task is None or task.status != TaskStatus.FAILED.value:
        raise ConflictError(
            "task_not_failed",
            "只有失败的任务可以从失败步骤重试",
        )
    task.status = TaskStatus.PENDING.value
    task.attempt_count += 1
    task.last_error = None
    task.claimed_at = None
    task.started_at = None
    task.finished_at = None
    await db.flush()
    return source


async def process_source_extraction(
    db: AsyncSession,
    source: Source,
    task: ProcessingTask,
    provider: AIProvider,
) -> None:
    """执行 AI 提取：成功时在同一事务写入候选并标记任务成功。"""
    results = await provider.extract_candidates(
        source.content,
        source.source_type,
    )
    if not results:
        raise AIProviderError("未生成有效候选，请重试")
    for index, result in enumerate(results):
        db.add(
            Extraction(
                source_id=source.id,
                workspace_id=source.workspace_id,
                title=result.title,
                content=result.content,
                entry_type=result.entry_type,
                suggested_node_path=result.suggested_node_path,
                key_params=result.key_params,
                risk_points=result.risk_points,
                applicable_conditions=result.applicable_conditions,
                confidence=result.confidence,
                sort_order=index,
            )
        )
    task.status = TaskStatus.SUCCEEDED.value
    task.finished_at = utc_now()
    await db.flush()


async def process_source_ocr(
    db: AsyncSession,
    source: Source,
    task: ProcessingTask,
    provider: AIProvider,
) -> None:
    """OCR 阶段：识别并写入正文，推进任务到 AI 提取阶段。"""
    storage = get_attachment_storage()
    attachments = await _load_attachments(db, [source.id])
    items = attachments.get(source.id, [])
    if not items:
        raise AIProviderError("图片附件不存在，无法执行 OCR")
    parts: list[str] = []
    for index, attachment in enumerate(items, start=1):
        image_data = await storage.read(
            workspace_id=source.workspace_id,
            source_id=source.id,
            object_key=attachment.object_key,
        )
        if image_data is None:
            raise AIProviderError(f"第 {index} 张图片附件不存在，无法执行 OCR")
        try:
            text = await run_ocr_with_fallback(
                provider,
                prepare_ocr_image(image_data),
            )
        except AIProviderError as exc:
            raise AIProviderError(f"第 {index} 张识别失败：{exc}") from exc
        parts.append(f"图 {index}：\n{text}")
    text = "\n\n".join(parts)
    source.content = text
    source.content_status = SourceContentStatus.SAVED.value
    if source.title in {"图片资料", "未命名记录"}:
        source.title = derive_ocr_title(text)
    task.stage = TaskStage.AI_EXTRACTION.value
    await db.flush()
