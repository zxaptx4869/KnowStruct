"""Workspace-scoped Review data-driven findings and their resolutions."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import DomainError, ResourceNotFoundError
from app.models import (
    AiFindingStatus,
    Entry,
    EntrySource,
    EntryStatus,
    FindingTargetType,
    FindingType,
    Node,
    Project,
    ResolutionType,
    ReviewAiFinding,
    ReviewResolution,
    Source,
)
from app.schemas.review import ReviewFindingItem

MAX_NODE_DEPTH = 6
FINDINGS_LIMIT = 200
NAIVE_EPOCH = datetime.fromtimestamp(0, UTC).replace(tzinfo=None)


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def parse_finding_type(value: str) -> FindingType:
    try:
        return FindingType(value)
    except ValueError as exc:
        raise DomainError(422, "invalid_finding_type", "不支持的检查类型") from exc


def parse_target_type(value: str) -> FindingTargetType:
    try:
        return FindingTargetType(value)
    except ValueError as exc:
        raise DomainError(422, "invalid_target_type", "不支持的目标类型") from exc


def parse_resolution(value: str) -> ResolutionType:
    try:
        return ResolutionType(value)
    except ValueError as exc:
        raise DomainError(422, "invalid_resolution", "不支持的处理方式") from exc


async def _resolved_keys(
    db: AsyncSession,
    workspace_id: str,
    finding_type: FindingType | None = None,
) -> set[tuple[str, str, str]]:
    stmt = select(ReviewResolution).where(
        ReviewResolution.workspace_id == workspace_id
    )
    if finding_type is not None:
        stmt = stmt.where(ReviewResolution.finding_type == finding_type.value)
    rows = (await db.scalars(stmt)).all()
    return {
        (row.finding_type, row.target_type, row.target_id)
        for row in rows
    }


async def _load_projects_and_paths(
    db: AsyncSession,
    workspace_id: str,
    project_ids: set[str],
) -> tuple[dict[str, str], dict[str, list[str]]]:
    """返回 project_id -> name 与 node_id -> 名称路径。"""
    projects: dict[str, str] = {}
    if project_ids:
        project_rows = (
            await db.scalars(
                select(Project).where(
                    Project.id.in_(project_ids),
                    Project.workspace_id == workspace_id,
                )
            )
        ).all()
        projects = {project.id: project.name for project in project_rows}

    paths: dict[str, list[str]] = {}
    if project_ids:
        nodes = (
            await db.scalars(
                select(Node).where(Node.project_id.in_(project_ids))
            )
        ).all()
        index = {node.id: node for node in nodes}

        def path_of(node_id: str) -> list[str]:
            names: list[str] = []
            seen: set[str] = set()
            current: str | None = node_id
            while current:
                if current in seen or len(names) > MAX_NODE_DEPTH:
                    return []
                seen.add(current)
                node = index.get(current)
                if node is None:
                    return []
                names.append(node.name)
                current = node.parent_id
            return list(reversed(names))

        for node in nodes:
            paths[node.id] = path_of(node.id)
    return projects, paths


def _entry_item(
    finding_type: FindingType,
    entry: Entry,
    projects: dict[str, str],
    paths: dict[str, list[str]],
    summary: str,
) -> ReviewFindingItem:
    return ReviewFindingItem(
        finding_type=finding_type,
        target_type=FindingTargetType.ENTRY,
        target_id=entry.id,
        title=entry.title,
        summary=summary,
        created_at=entry.created_at,
        entry_type=entry.entry_type,
        content=entry.content,
        conditions=entry.applicable_conditions,
        project_id=entry.project_id,
        project_name=projects.get(entry.project_id),
        node_id=entry.node_id,
        node_path=paths.get(entry.node_id or "", []) if entry.node_id else [],
    )


async def _missing_source_items(
    db: AsyncSession,
    workspace_id: str,
    resolved: set[tuple[str, str, str]],
) -> list[ReviewFindingItem]:
    without_source = ~(
        select(EntrySource.entry_id)
        .where(EntrySource.entry_id == Entry.id)
        .exists()
    )
    entries = (
        await db.scalars(
            select(Entry).where(
                Entry.workspace_id == workspace_id,
                Entry.status == EntryStatus.ARCHIVED.value,
                without_source,
            )
        )
    ).all()
    if not entries:
        return []
    projects, paths = await _load_projects_and_paths(
        db,
        workspace_id,
        {entry.project_id for entry in entries},
    )
    items: list[ReviewFindingItem] = []
    for entry in entries:
        key = (FindingType.MISSING_SOURCE.value, FindingTargetType.ENTRY.value, entry.id)
        if key in resolved:
            continue
        items.append(
            _entry_item(
                FindingType.MISSING_SOURCE,
                entry,
                projects,
                paths,
                "该记录没有任何来源关联，无法回溯原始证据",
            )
        )
    return items


async def _missing_conditions_items(
    db: AsyncSession,
    workspace_id: str,
    resolved: set[tuple[str, str, str]],
) -> list[ReviewFindingItem]:
    entries = (
        await db.scalars(
            select(Entry).where(
                Entry.workspace_id == workspace_id,
                Entry.status == EntryStatus.ARCHIVED.value,
            )
        )
    ).all()
    if not entries:
        return []
    projects, paths = await _load_projects_and_paths(
        db,
        workspace_id,
        {entry.project_id for entry in entries},
    )
    items: list[ReviewFindingItem] = []
    for entry in entries:
        if entry.applicable_conditions:
            continue
        key = (
            FindingType.MISSING_CONDITIONS.value,
            FindingTargetType.ENTRY.value,
            entry.id,
        )
        if key in resolved:
            continue
        items.append(
            _entry_item(
                FindingType.MISSING_CONDITIONS,
                entry,
                projects,
                paths,
                "该记录没有适用条件，使用结论时可能误用范围",
            )
        )
    return items


async def compute_open_findings(
    db: AsyncSession,
    workspace_id: str,
    finding_type: FindingType | None = None,
) -> list[ReviewFindingItem]:
    resolved = await _resolved_keys(db, workspace_id, finding_type)
    items: list[ReviewFindingItem] = []
    if finding_type is None or finding_type == FindingType.MISSING_SOURCE:
        items.extend(await _missing_source_items(db, workspace_id, resolved))
    if finding_type is None or finding_type == FindingType.MISSING_CONDITIONS:
        items.extend(await _missing_conditions_items(db, workspace_id, resolved))
    if finding_type is None or finding_type in (
        FindingType.DUPLICATE,
        FindingType.CONFLICT,
    ):
        items.extend(await _ai_open_items(db, workspace_id, resolved, finding_type))
    items.sort(key=lambda item: item.created_at or NAIVE_EPOCH, reverse=True)
    return items[:FINDINGS_LIMIT]


async def _ai_open_items(
    db: AsyncSession,
    workspace_id: str,
    resolved: set[tuple[str, str, str]],
    finding_type: FindingType | None,
) -> list[ReviewFindingItem]:
    stmt = select(ReviewAiFinding).where(
        ReviewAiFinding.workspace_id == workspace_id,
        ReviewAiFinding.status == AiFindingStatus.OPEN.value,
    )
    if finding_type is not None:
        stmt = stmt.where(ReviewAiFinding.review_type == finding_type.value)
    findings = (await db.scalars(stmt)).all()
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

    items: list[ReviewFindingItem] = []
    for finding in findings:
        key = (
            finding.review_type,
            FindingTargetType.AI_FINDING.value,
            finding.id,
        )
        if key in resolved:
            continue
        entry_a = entries.get(finding.entry_a_id)
        entry_b = entries.get(finding.entry_b_id)
        if entry_a is None or entry_b is None:
            continue
        items.append(
            ReviewFindingItem(
                finding_type=FindingType(finding.review_type),
                target_type=FindingTargetType.AI_FINDING,
                target_id=finding.id,
                title=f"{entry_a.title} vs {entry_b.title}",
                summary=finding.description,
                created_at=finding.created_at,
                entry_type=entry_a.entry_type,
                content=entry_a.content,
                conditions=entry_a.applicable_conditions,
                project_id=entry_a.project_id,
                project_name=projects.get(entry_a.project_id),
                node_id=entry_a.node_id,
                node_path=(
                    paths.get(entry_a.node_id or "", [])
                    if entry_a.node_id
                    else []
                ),
                entry_b_id=entry_b.id,
                entry_b_title=entry_b.title,
                entry_b_content=entry_b.content,
                entry_b_project_id=entry_b.project_id,
                entry_b_node_id=entry_b.node_id,
                ai_description=finding.description,
                ai_suggestion=finding.suggestion,
                ai_severity=finding.severity,
            )
        )
    return items


async def _resolved_item(
    db: AsyncSession,
    workspace_id: str,
    resolution: ReviewResolution,
) -> ReviewFindingItem:
    finding_type = parse_finding_type(resolution.finding_type)
    target_type = parse_target_type(resolution.target_type)
    handled_label = (
        "已解决"
        if resolution.resolution == ResolutionType.RESOLVED.value
        else "已拒绝"
    )
    base = ReviewFindingItem(
        finding_type=finding_type,
        target_type=target_type,
        target_id=resolution.target_id,
        title="（目标已删除）",
        summary="目标记录已删除，处理记录保留",
        resolution=ResolutionType(resolution.resolution),
        note=resolution.note,
        resolved_at=resolution.created_at,
    )
    if target_type == FindingTargetType.AI_FINDING:
        finding = await db.scalar(
            select(ReviewAiFinding).where(
                ReviewAiFinding.id == resolution.target_id,
                ReviewAiFinding.workspace_id == workspace_id,
            )
        )
        if finding is not None:
            entry_a = await db.scalar(
                select(Entry).where(
                    Entry.id == finding.entry_a_id,
                    Entry.workspace_id == workspace_id,
                )
            )
            entry_b = await db.scalar(
                select(Entry).where(
                    Entry.id == finding.entry_b_id,
                    Entry.workspace_id == workspace_id,
                )
            )
            if entry_a is not None and entry_b is not None:
                projects, paths = await _load_projects_and_paths(
                    db,
                    workspace_id,
                    {entry_a.project_id},
                )
                base.finding_type = FindingType(finding.review_type)
                base.title = f"{entry_a.title} vs {entry_b.title}"
                base.summary = finding.description
                base.entry_type = entry_a.entry_type
                base.content = entry_a.content
                base.conditions = entry_a.applicable_conditions
                base.project_id = entry_a.project_id
                base.project_name = projects.get(entry_a.project_id)
                base.node_id = entry_a.node_id
                base.node_path = (
                    paths.get(entry_a.node_id or "", [])
                    if entry_a.node_id
                    else []
                )
                base.entry_b_id = entry_b.id
                base.entry_b_title = entry_b.title
                base.entry_b_content = entry_b.content
                base.entry_b_project_id = entry_b.project_id
                base.entry_b_node_id = entry_b.node_id
                base.ai_description = finding.description
                base.ai_suggestion = finding.suggestion
                base.ai_severity = finding.severity
        return base
    if target_type == FindingTargetType.ENTRY:
        entry = await db.scalar(
            select(Entry).where(
                Entry.id == resolution.target_id,
                Entry.workspace_id == workspace_id,
            )
        )
        if entry is not None:
            projects, paths = await _load_projects_and_paths(
                db,
                workspace_id,
                {entry.project_id},
            )
            item = _entry_item(
                finding_type,
                entry,
                projects,
                paths,
                f"{handled_label}的问题记录",
            )
            item.resolution = ResolutionType(resolution.resolution)
            item.note = resolution.note
            item.resolved_at = resolution.created_at
            return item
    else:
        source = await db.scalar(
            select(Source).where(
                Source.id == resolution.target_id,
                Source.workspace_id == workspace_id,
            )
        )
        if source is not None:
            base.title = source.title
            base.summary = f"{handled_label}的问题来源"
            base.source_type = source.source_type
            base.content = source.content
            base.link_url = source.link_url
            base.project_id = source.project_id
            return base
    return base


async def list_resolved_findings(
    db: AsyncSession,
    workspace_id: str,
    finding_type: FindingType | None = None,
) -> list[ReviewFindingItem]:
    stmt = select(ReviewResolution).where(
        ReviewResolution.workspace_id == workspace_id,
        ReviewResolution.resolution == ResolutionType.RESOLVED.value,
    )
    if finding_type is not None:
        stmt = stmt.where(ReviewResolution.finding_type == finding_type.value)
    resolutions = (await db.scalars(stmt)).all()
    items = [
        await _resolved_item(db, workspace_id, resolution)
        for resolution in resolutions
    ]
    items.sort(
        key=lambda item: item.resolved_at or NAIVE_EPOCH,
        reverse=True,
    )
    return items[:FINDINGS_LIMIT]


async def list_rejected_findings(
    db: AsyncSession,
    workspace_id: str,
    finding_type: FindingType | None = None,
) -> list[ReviewFindingItem]:
    stmt = select(ReviewResolution).where(
        ReviewResolution.workspace_id == workspace_id,
        ReviewResolution.resolution == ResolutionType.REJECTED.value,
    )
    if finding_type is not None:
        stmt = stmt.where(ReviewResolution.finding_type == finding_type.value)
    resolutions = (await db.scalars(stmt)).all()
    items = [
        await _resolved_item(db, workspace_id, resolution)
        for resolution in resolutions
    ]
    items.sort(
        key=lambda item: item.resolved_at or NAIVE_EPOCH,
        reverse=True,
    )
    return items[:FINDINGS_LIMIT]


async def _ensure_target(
    db: AsyncSession,
    workspace_id: str,
    target_type: FindingTargetType,
    target_id: str,
) -> None:
    if target_type == FindingTargetType.AI_FINDING:
        exists = await db.scalar(
            select(ReviewAiFinding.id).where(
                ReviewAiFinding.id == target_id,
                ReviewAiFinding.workspace_id == workspace_id,
            )
        )
    elif target_type == FindingTargetType.ENTRY:
        exists = await db.scalar(
            select(Entry.id).where(
                Entry.id == target_id,
                Entry.workspace_id == workspace_id,
            )
        )
    else:
        exists = await db.scalar(
            select(Source.id).where(
                Source.id == target_id,
                Source.workspace_id == workspace_id,
            )
        )
    if exists is None:
        raise ResourceNotFoundError("target")


async def _finding_exists(
    db: AsyncSession,
    workspace_id: str,
    finding_type: FindingType,
    target_type: FindingTargetType,
    target_id: str,
) -> bool:
    if target_type == FindingTargetType.AI_FINDING:
        if finding_type not in (
            FindingType.DUPLICATE,
            FindingType.CONFLICT,
        ):
            return False
        finding = await db.scalar(
            select(ReviewAiFinding).where(
                ReviewAiFinding.id == target_id,
                ReviewAiFinding.workspace_id == workspace_id,
                ReviewAiFinding.status == AiFindingStatus.OPEN.value,
            )
        )
        return finding is not None and finding.review_type == finding_type.value

    if target_type == FindingTargetType.ENTRY:
        entry = await db.scalar(
            select(Entry).where(
                Entry.id == target_id,
                Entry.workspace_id == workspace_id,
                Entry.status == EntryStatus.ARCHIVED.value,
            )
        )
        if entry is None:
            return False
        if finding_type == FindingType.MISSING_SOURCE:
            linked = await db.scalar(
                select(EntrySource.entry_id).where(
                    EntrySource.entry_id == target_id
                )
            )
            return linked is None
        if finding_type == FindingType.MISSING_CONDITIONS:
            return not entry.applicable_conditions
        return False

    return False


async def set_resolution(
    db: AsyncSession,
    workspace_id: str,
    finding_type: FindingType,
    target_type: FindingTargetType,
    target_id: str,
    resolution: ResolutionType,
    note: str | None,
) -> None:
    await _ensure_target(db, workspace_id, target_type, target_id)
    if not await _finding_exists(
        db,
        workspace_id,
        finding_type,
        target_type,
        target_id,
    ):
        raise DomainError(
            409,
            "finding_not_found",
            "该问题当前不存在，无需处理",
        )
    resolution_row = await db.scalar(
        select(ReviewResolution).where(
            ReviewResolution.workspace_id == workspace_id,
            ReviewResolution.finding_type == finding_type.value,
            ReviewResolution.target_type == target_type.value,
            ReviewResolution.target_id == target_id,
        )
    )
    if resolution_row is None:
        db.add(
            ReviewResolution(
                workspace_id=workspace_id,
                finding_type=finding_type.value,
                target_type=target_type.value,
                target_id=target_id,
                resolution=resolution.value,
                note=note,
            )
        )
    else:
        resolution_row.resolution = resolution.value
        resolution_row.note = note
    await db.flush()


async def remove_resolution(
    db: AsyncSession,
    workspace_id: str,
    finding_type: FindingType,
    target_type: FindingTargetType,
    target_id: str,
) -> bool:
    resolution_row = await db.scalar(
        select(ReviewResolution).where(
            ReviewResolution.workspace_id == workspace_id,
            ReviewResolution.finding_type == finding_type.value,
            ReviewResolution.target_type == target_type.value,
            ReviewResolution.target_id == target_id,
        )
    )
    if resolution_row is None:
        return False
    await db.delete(resolution_row)
    await db.flush()
    return True
