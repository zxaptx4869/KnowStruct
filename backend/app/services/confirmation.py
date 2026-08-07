"""Extraction confirmation and formal entry creation."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ConflictError, ResourceNotFoundError
from app.models import (
    Entry,
    EntrySource,
    Extraction,
    Node,
    ProcessingTask,
    Source,
    TaskStatus,
)
from app.schemas.inbox import DecideRequest
from app.services.inbox import utc_now
from app.services.projects import get_project


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
