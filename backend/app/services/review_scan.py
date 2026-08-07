"""Scoped AI review scan execution."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AIProvider
from app.api.errors import ConflictError, ResourceNotFoundError
from app.models import (
    AiFindingStatus,
    AiReviewType,
    Entry,
    EntryStatus,
    FindingTargetType,
    Node,
    Project,
    ReviewAiFinding,
    ReviewResolution,
    ReviewScan,
    ScanScopeType,
    ScanStatus,
)
from app.schemas.review import ReviewAiEntryRef, ReviewCandidateItem
from app.services.review import _load_projects_and_paths, utc_now

SCAN_ENTRY_LIMIT = 100
BATCH_SIZE = 30
MAX_ENTRY_CONTENT_LENGTH = 2000


async def validate_scope(
    db: AsyncSession,
    workspace_id: str,
    scope_type: ScanScopeType,
    project_id: str | None,
    node_id: str | None,
) -> str | None:
    """校验范围归属并返回 scope_id；跨 Workspace 按不存在处理。"""
    if scope_type == ScanScopeType.WORKSPACE:
        return None
    if scope_type == ScanScopeType.PROJECT:
        if not project_id:
            raise ConflictError("invalid_scope", "请选择要审查的项目")
        project = await db.scalar(
            select(Project.id).where(
                Project.id == project_id,
                Project.workspace_id == workspace_id,
            )
        )
        if project is None:
            raise ResourceNotFoundError("project")
        return project_id
    if not project_id or not node_id:
        raise ConflictError("invalid_scope", "请选择要审查的项目与节点")
    project = await db.scalar(
        select(Project.id).where(
            Project.id == project_id,
            Project.workspace_id == workspace_id,
        )
    )
    if project is None:
        raise ResourceNotFoundError("project")
    node = await db.scalar(
        select(Node.id).where(
            Node.id == node_id,
            Node.project_id == project_id,
        )
    )
    if node is None:
        raise ResourceNotFoundError("node")
    return node_id


async def load_scan_entries(
    db: AsyncSession,
    workspace_id: str,
    scope_type: ScanScopeType,
    scope_id: str | None,
) -> tuple[list[Entry], bool]:
    """加载范围内已归档 Entry（按创建时间排序），按同节点分组并截断到上限。"""
    stmt = (
        select(Entry)
        .where(
            Entry.workspace_id == workspace_id,
            Entry.status == EntryStatus.ARCHIVED.value,
        )
        .order_by(Entry.created_at, Entry.id)
    )
    if scope_type == ScanScopeType.PROJECT:
        stmt = stmt.where(Entry.project_id == scope_id)
    elif scope_type == ScanScopeType.NODE:
        stmt = stmt.where(Entry.node_id == scope_id)
    entries = (await db.scalars(stmt)).all()

    groups: dict[str, list[Entry]] = {}
    for entry in entries:
        key = entry.node_id or f"project:{entry.project_id}"
        groups.setdefault(key, []).append(entry)

    selected: list[Entry] = []
    truncated = False
    for group in groups.values():
        for entry in group:
            if len(selected) >= SCAN_ENTRY_LIMIT:
                truncated = True
                break
            selected.append(entry)
        if truncated:
            break
    return selected, truncated


def _entry_dict(entry: Entry) -> dict:
    content = (entry.content or "")[:MAX_ENTRY_CONTENT_LENGTH]
    return {
        "id": entry.id,
        "title": entry.title,
        "content": content,
        "entry_type": entry.entry_type,
    }


async def _create_candidates(
    db: AsyncSession,
    workspace_id: str,
    scan: ReviewScan,
    entries_by_id: dict[str, Entry],
    results: list,
) -> int:
    """把 AI 结果转为候选发现；跳过非 duplicate/conflict 与非同组配对。"""
    created = 0
    group_entry_ids = set(entries_by_id)
    for result in results:
        if result.review_type not in (
            AiReviewType.DUPLICATE.value,
            AiReviewType.CONFLICT.value,
        ):
            continue
        related = [
            entry_id
            for entry_id in result.related_entry_ids
            if entry_id in group_entry_ids
        ][:2]
        if len(related) < 2:
            continue
        entry_a_id, entry_b_id = sorted([related[0], related[1]])
        existing = await db.scalar(
            select(ReviewAiFinding).where(
                ReviewAiFinding.workspace_id == workspace_id,
                ReviewAiFinding.review_type == result.review_type,
                ReviewAiFinding.entry_a_id == entry_a_id,
                ReviewAiFinding.entry_b_id == entry_b_id,
            )
        )
        if existing is not None:
            if existing.status == AiFindingStatus.CANDIDATE.value:
                continue
            if existing.status == AiFindingStatus.OPEN.value:
                resolution = await db.scalar(
                    select(ReviewResolution).where(
                        ReviewResolution.workspace_id == workspace_id,
                        ReviewResolution.finding_type == result.review_type,
                        ReviewResolution.target_type
                        == FindingTargetType.AI_FINDING.value,
                        ReviewResolution.target_id == existing.id,
                    )
                )
                if resolution is None:
                    # 已确认且未处理：问题仍在待处理列表，不重复生成
                    continue
                # 已解决/忽略但数据未修复：清除处理记录，问题重新浮现
                await db.delete(resolution)
                continue
            existing.scan_id = scan.id
            existing.description = result.description
            existing.suggestion = result.suggestion or None
            existing.severity = result.severity
            existing.status = AiFindingStatus.CANDIDATE.value
            created += 1
            continue
        db.add(
            ReviewAiFinding(
                workspace_id=workspace_id,
                scan_id=scan.id,
                review_type=result.review_type,
                entry_a_id=entry_a_id,
                entry_b_id=entry_b_id,
                description=result.description,
                suggestion=result.suggestion or None,
                severity=result.severity,
                status=AiFindingStatus.CANDIDATE.value,
            )
        )
        created += 1
    return created


async def run_scan(
    db: AsyncSession,
    scan: ReviewScan,
    provider: AIProvider,
) -> None:
    """执行扫描：加载范围条目、分批调用 AI、写候选并标记成功。"""
    entries, truncated = await load_scan_entries(
        db,
        scan.workspace_id,
        ScanScopeType(scan.scope_type),
        scan.scope_id,
    )
    scan.truncated = truncated
    scan.status = ScanStatus.RUNNING.value
    scan.started_at = utc_now()
    await db.flush()

    findings_count = 0
    for start in range(0, len(entries), BATCH_SIZE):
        batch = entries[start : start + BATCH_SIZE]
        entries_by_id = {entry.id: entry for entry in batch}
        results = await provider.review(
            [_entry_dict(entry) for entry in batch]
        )
        findings_count += await _create_candidates(
            db,
            scan.workspace_id,
            scan,
            entries_by_id,
            results,
        )

    scan.status = ScanStatus.SUCCEEDED.value
    scan.findings_count = findings_count
    scan.finished_at = utc_now()
    await db.flush()


def _entry_ref(
    entry: Entry,
    projects: dict[str, str],
    paths: dict[str, list[str]],
) -> ReviewAiEntryRef:
    return ReviewAiEntryRef(
        id=entry.id,
        title=entry.title,
        content=entry.content,
        entry_type=entry.entry_type,
        project_id=entry.project_id,
        project_name=projects.get(entry.project_id),
        node_id=entry.node_id,
        node_path=(
            paths.get(entry.node_id or "", []) if entry.node_id else []
        ),
    )


async def list_scan_candidates(
    db: AsyncSession,
    workspace_id: str,
    scan_id: str,
) -> list[ReviewCandidateItem]:
    findings = (
        await db.scalars(
            select(ReviewAiFinding)
            .where(
                ReviewAiFinding.scan_id == scan_id,
                ReviewAiFinding.workspace_id == workspace_id,
                ReviewAiFinding.status == AiFindingStatus.CANDIDATE.value,
            )
            .order_by(ReviewAiFinding.created_at, ReviewAiFinding.id)
        )
    ).all()
    if not findings:
        return []

    entry_ids = {
        entry_id
        for finding in findings
        for entry_id in (finding.entry_a_id, finding.entry_b_id)
    }
    entries = {
        entry.id: entry
        for entry in (
            await db.scalars(
                select(Entry).where(
                    Entry.id.in_(entry_ids),
                    Entry.workspace_id == workspace_id,
                )
            )
        ).all()
    }
    projects, paths = await _load_projects_and_paths(
        db,
        workspace_id,
        {entry.project_id for entry in entries.values()},
    )
    items: list[ReviewCandidateItem] = []
    for finding in findings:
        entry_a = entries.get(finding.entry_a_id)
        entry_b = entries.get(finding.entry_b_id)
        if entry_a is None or entry_b is None:
            continue
        items.append(
            ReviewCandidateItem(
                id=finding.id,
                review_type=finding.review_type,
                status=finding.status,
                description=finding.description,
                suggestion=finding.suggestion,
                severity=finding.severity,
                entry_a=_entry_ref(entry_a, projects, paths),
                entry_b=_entry_ref(entry_b, projects, paths),
            )
        )
    return items
