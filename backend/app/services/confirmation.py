"""Extraction confirmation and formal entry creation."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ConflictError, ResourceNotFoundError
from app.models import (
    Entry,
    EntrySource,
    Extraction,
    ExtractionStatus,
    Node,
    ProcessingTask,
    Source,
    TaskStatus,
)
from app.schemas.inbox import DecideRequest
from app.services.inbox import utc_now
from app.services.projects import get_project

LOW_CONFIDENCE_THRESHOLD = 0.7
MAX_BATCH_CANDIDATES = 200


def _is_confirmable(extraction: Extraction) -> bool:
    """批量确认只处理待确认且置信度不低于阈值的候选（NULL 视为满足）。"""
    return (
        extraction.status == ExtractionStatus.PENDING_CONFIRM.value
        and (
            extraction.confidence is None
            or extraction.confidence >= LOW_CONFIDENCE_THRESHOLD
        )
    )


async def _get_scoped_source(
    db: AsyncSession,
    workspace_id: str,
    source_id: str,
) -> Source:
    source = await db.scalar(
        select(Source)
        .where(
            Source.id == source_id,
            Source.workspace_id == workspace_id,
        )
        .with_for_update()
    )
    if source is None:
        raise ResourceNotFoundError("source")
    return source


async def _get_scoped_extraction(
    db: AsyncSession,
    workspace_id: str,
    source_id: str,
    extraction_id: str,
) -> Extraction:
    extraction = await db.scalar(
        select(Extraction).where(
            Extraction.id == extraction_id,
            Extraction.source_id == source_id,
            Extraction.workspace_id == workspace_id,
        )
    )
    if extraction is None:
        raise ResourceNotFoundError("extraction")
    return extraction


async def decide_extraction(
    db: AsyncSession,
    workspace_id: str,
    source_id: str,
    extraction_id: str,
    payload: DecideRequest,
) -> tuple[Extraction, Entry | None]:
    source = await _get_scoped_source(db, workspace_id, source_id)
    extraction = await _get_scoped_extraction(
        db,
        workspace_id,
        source_id,
        extraction_id,
    )

    # 幂等：相同决定重复提交返回原结果，不重复创建 Entry。
    if extraction.status == "accepted":
        entry = await db.scalar(
            select(Entry).where(Entry.extraction_id == extraction.id)
        )
        if payload.decision == "accepted":
            return extraction, entry
        raise ConflictError("extraction_already_decided", "该候选已接受，不能再次拒绝")
    if extraction.status == "rejected":
        if payload.decision == "rejected":
            return extraction, None
        raise ConflictError("extraction_already_decided", "该候选已拒绝，不能再次接受")

    now = utc_now()
    if payload.decision == "rejected":
        extraction.status = "rejected"
        extraction.decided_at = now
        await db.flush()
        return extraction, None

    if not payload.project_id:
        raise ConflictError("project_required", "接受候选前必须确认项目")
    project = await get_project(db, workspace_id, payload.project_id)

    node_id = None
    if payload.node_id:
        node = await db.scalar(
            select(Node).where(
                Node.id == payload.node_id,
                Node.project_id == project.id,
            )
        )
        if node is None:
            raise ConflictError(
                "invalid_node_for_project",
                "选择的归档节点不属于所选项目",
            )
        node_id = node.id

    title = payload.title or extraction.title
    content = payload.content or extraction.content
    entry_type = payload.entry_type or extraction.entry_type
    conditions = (
        payload.applicable_conditions
        if payload.applicable_conditions is not None
        else extraction.applicable_conditions
    )

    entry = Entry(
        workspace_id=workspace_id,
        project_id=project.id,
        node_id=node_id,
        extraction_id=extraction.id,
        entry_type=entry_type,
        title=title,
        content=content,
        applicable_conditions=conditions,
        status="archived",
    )
    db.add(entry)
    await db.flush()
    db.add(EntrySource(entry_id=entry.id, source_id=source.id))
    # 归档到某项目后，Source 归属该项目，详情页与采集箱同步显示
    source.project_id = project.id

    extraction.status = "accepted"
    extraction.decided_at = now
    extraction.title = title
    extraction.content = content
    extraction.entry_type = entry_type
    extraction.applicable_conditions = conditions
    await db.flush()
    return extraction, entry


@dataclass(frozen=True)
class CompleteData:
    total: int
    pending_confirm: int
    accepted: int
    rejected: int

    @property
    def completed(self) -> bool:
        return self.pending_confirm == 0


async def complete_source(
    db: AsyncSession,
    workspace_id: str,
    source_id: str,
) -> CompleteData:
    await _get_scoped_source(db, workspace_id, source_id)
    task = await db.scalar(
        select(ProcessingTask).where(ProcessingTask.source_id == source_id)
    )
    if task is None or task.status != TaskStatus.SUCCEEDED.value:
        raise ConflictError(
            "task_not_completed",
            "资料仍在处理中或处理失败，无法完成",
        )
    extractions = list(
        (
            await db.scalars(
                select(Extraction).where(Extraction.source_id == source_id)
            )
        ).all()
    )
    pending = sum(
        1 for extraction in extractions if extraction.status == "pending_confirm"
    )
    accepted = sum(
        1 for extraction in extractions if extraction.status == "accepted"
    )
    rejected = sum(
        1 for extraction in extractions if extraction.status == "rejected"
    )
    data = CompleteData(
        total=len(extractions),
        pending_confirm=pending,
        accepted=accepted,
        rejected=rejected,
    )
    if not data.completed:
        raise ConflictError(
            "pending_extractions",
            f"还有 {pending} 条候选未决定，请先逐条确认",
            pending_count=pending,
        )
    return data


@dataclass(frozen=True)
class BatchConfirmResult:
    confirmed_sources: int
    entries_created: int
    skipped_low_confidence: int


async def batch_confirm_sources(
    db: AsyncSession,
    workspace_id: str,
    source_ids: list[str],
    project_id: str,
    node_id: str | None,
) -> BatchConfirmResult:
    """来源级批量确认：同一事务内归档全部可批量确认候选。"""
    unique_ids = list(dict.fromkeys(source_ids))
    rows = (
        await db.scalars(
            select(Source)
            .where(
                Source.id.in_(unique_ids),
                Source.workspace_id == workspace_id,
            )
            .with_for_update()
        )
    ).all()
    sources = {source.id: source for source in rows}
    if len(sources) != len(unique_ids):
        raise ResourceNotFoundError("source")

    project = await get_project(db, workspace_id, project_id)

    node = None
    if node_id:
        node = await db.scalar(
            select(Node).where(
                Node.id == node_id,
                Node.project_id == project.id,
            )
        )
        if node is None:
            raise ConflictError(
                "invalid_node_for_project",
                "选择的归档节点不属于所选项目",
            )

    ids = list(sources)
    tasks = {
        task.source_id: task
        for task in (
            await db.scalars(
                select(ProcessingTask).where(ProcessingTask.source_id.in_(ids))
            )
        ).all()
    }
    extractions = list(
        (
            await db.scalars(
                select(Extraction)
                .where(Extraction.source_id.in_(ids))
                .order_by(Extraction.source_id, Extraction.sort_order, Extraction.id)
            )
        ).all()
    )
    by_source: dict[str, list[Extraction]] = {}
    for extraction in extractions:
        by_source.setdefault(extraction.source_id, []).append(extraction)

    not_pending = [
        source.id
        for source in sources.values()
        if (
            tasks.get(source.id) is None
            or tasks[source.id].status != TaskStatus.SUCCEEDED.value
            or not any(
                item.status == ExtractionStatus.PENDING_CONFIRM.value
                for item in by_source.get(source.id, [])
            )
        )
    ]
    if not_pending:
        raise ConflictError(
            "source_not_pending_confirm",
            "只有待确认的资料可以批量确认",
            blocker_count=len(not_pending),
        )

    to_confirm: list[Extraction] = []
    skipped = 0
    without_confirmable: list[str] = []
    for source_id, items in by_source.items():
        confirmable = [item for item in items if _is_confirmable(item)]
        to_confirm.extend(confirmable)
        skipped += sum(
            1
            for item in items
            if item.status == ExtractionStatus.PENDING_CONFIRM.value
            and not _is_confirmable(item)
        )
        if not confirmable:
            without_confirmable.append(source_id)
    pending_total = len(to_confirm) + skipped
    if pending_total > MAX_BATCH_CANDIDATES:
        raise ConflictError(
            "too_many_candidates",
            "候选总数超过上限，请分批确认",
            blocker_count=pending_total,
        )
    if without_confirmable:
        raise ConflictError(
            "source_without_confirmable_candidates",
            "存在没有可批量确认候选的资料（全部低置信度或没有候选）",
            blocker_count=len(without_confirmable),
        )

    now = utc_now()
    confirmed_source_ids: set[str] = set()
    for extraction in to_confirm:
        source = sources[extraction.source_id]
        entry = Entry(
            workspace_id=workspace_id,
            project_id=project.id,
            node_id=node.id if node else None,
            extraction_id=extraction.id,
            entry_type=extraction.entry_type,
            title=extraction.title,
            content=extraction.content,
            applicable_conditions=extraction.applicable_conditions,
            status="archived",
        )
        db.add(entry)
        await db.flush()
        db.add(EntrySource(entry_id=entry.id, source_id=source.id))
        source.project_id = project.id
        extraction.status = ExtractionStatus.ACCEPTED.value
        extraction.decided_at = now
        confirmed_source_ids.add(source.id)
    await db.flush()
    return BatchConfirmResult(
        confirmed_sources=len(confirmed_source_ids),
        entries_created=len(to_confirm),
        skipped_low_confidence=skipped,
    )
