"""Scoped AI review scan execution."""

from __future__ import annotations

from sqlalchemy import func, select
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
    ResolutionType,
    ReviewAiFinding,
    ReviewResolution,
    ReviewScan,
    ScanScopeType,
    ScanStatus,
)
from app.services.review import utc_now

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


async def _create_findings(
    db: AsyncSession,
    workspace_id: str,
    scan: ReviewScan,
    entries_by_id: dict[str, Entry],
    results: list,
) -> tuple[int, int]:
    """把 AI 结果直接转为 open 发现；返回 (新发现数, 跳过已拒绝数)。"""
    created = 0
    skipped = 0
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
            resolution = await db.scalar(
                select(ReviewResolution).where(
                    ReviewResolution.workspace_id == workspace_id,
                    ReviewResolution.target_type
                    == FindingTargetType.AI_FINDING.value,
                    ReviewResolution.target_id == existing.id,
                )
            )
            if resolution is None:
                # 已在待处理列表，不重复创建
                continue
            if resolution.resolution == ResolutionType.REJECTED.value:
                # 已拒绝：不再报问题，计入跳过数
                skipped += 1
                continue
            # 已解决：由扫描完成时的确定性检查清除并重新浮现
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
                status=AiFindingStatus.OPEN.value,
            )
        )
        created += 1
    return created, skipped


async def _resurface_handled_in_scope(
    db: AsyncSession,
    workspace_id: str,
    entries: list[Entry],
) -> int:
    """扫描覆盖范围内，已解决且记录仍存在的发现清除处理记录重新浮现。"""
    entry_ids = [entry.id for entry in entries]
    if not entry_ids:
        return 0
    findings = (
        await db.scalars(
            select(ReviewAiFinding).where(
                ReviewAiFinding.workspace_id == workspace_id,
                ReviewAiFinding.status == AiFindingStatus.OPEN.value,
                ReviewAiFinding.entry_a_id.in_(entry_ids),
                ReviewAiFinding.entry_b_id.in_(entry_ids),
            )
        )
    ).all()
    cleared = 0
    for finding in findings:
        resolution = await db.scalar(
            select(ReviewResolution).where(
                ReviewResolution.workspace_id == workspace_id,
                ReviewResolution.target_type
                == FindingTargetType.AI_FINDING.value,
                ReviewResolution.target_id == finding.id,
            )
        )
        if (
            resolution is not None
            and resolution.resolution == ResolutionType.RESOLVED.value
        ):
            await db.delete(resolution)
            cleared += 1
    return cleared


async def run_scan(
    db: AsyncSession,
    scan: ReviewScan,
    provider: AIProvider,
) -> None:
    """执行扫描：加载范围条目、分批调用 AI、直接写 open 发现并标记成功。"""
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
    skipped_rejected = 0
    for start in range(0, len(entries), BATCH_SIZE):
        batch = entries[start : start + BATCH_SIZE]
        entries_by_id = {entry.id: entry for entry in batch}
        results = await provider.review(
            [_entry_dict(entry) for entry in batch]
        )
        created, skipped = await _create_findings(
            db,
            scan.workspace_id,
            scan,
            entries_by_id,
            results,
        )
        findings_count += created
        skipped_rejected += skipped

    scan.resurfaced_count = await _resurface_handled_in_scope(
        db,
        scan.workspace_id,
        entries,
    )

    scan.status = ScanStatus.SUCCEEDED.value
    scan.findings_count = findings_count
    scan.skipped_rejected_count = skipped_rejected
    server_now = await db.scalar(func.now())
    scan.finished_at = server_now if server_now is not None else utc_now()
    await db.flush()


async def list_scans(
    db: AsyncSession,
    workspace_id: str,
    limit: int,
    offset: int,
) -> tuple[list[ReviewScan], int]:
    total = await db.scalar(
        select(func.count(ReviewScan.id)).where(
            ReviewScan.workspace_id == workspace_id
        )
    )
    scans = (
        await db.scalars(
            select(ReviewScan)
            .where(ReviewScan.workspace_id == workspace_id)
            .order_by(ReviewScan.created_at.desc(), ReviewScan.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return list(scans), int(total or 0)


async def scan_display_details(
    db: AsyncSession,
    workspace_id: str,
    scans: list[ReviewScan],
) -> tuple[dict[str, str], dict[str, dict[str, int]]]:
    """返回 scope_id -> 名称，以及 scan_id -> 决策统计。"""
    names: dict[str, str] = {}
    if not scans:
        return names, {}

    project_ids = [
        scan.scope_id
        for scan in scans
        if scan.scope_type == ScanScopeType.PROJECT.value and scan.scope_id
    ]
    node_ids = [
        scan.scope_id
        for scan in scans
        if scan.scope_type == ScanScopeType.NODE.value and scan.scope_id
    ]
    if project_ids:
        projects = (
            await db.scalars(
                select(Project).where(
                    Project.id.in_(project_ids),
                    Project.workspace_id == workspace_id,
                )
            )
        ).all()
        names.update({project.id: project.name for project in projects})
    if node_ids:
        nodes = (
            await db.scalars(select(Node).where(Node.id.in_(node_ids)))
        ).all()
        names.update({node.id: node.name for node in nodes})

    scan_ids = [scan.id for scan in scans]
    findings = (
        await db.scalars(
            select(ReviewAiFinding).where(
                ReviewAiFinding.workspace_id == workspace_id,
                ReviewAiFinding.scan_id.in_(scan_ids),
            )
        )
    ).all()
    finding_ids = [finding.id for finding in findings]
    resolution_map: dict[str, str] = {}
    if finding_ids:
        resolutions = (
            await db.scalars(
                select(ReviewResolution).where(
                    ReviewResolution.target_type
                    == FindingTargetType.AI_FINDING.value,
                    ReviewResolution.target_id.in_(finding_ids),
                )
            )
        ).all()
        resolution_map = {
            resolution.target_id: resolution.resolution
            for resolution in resolutions
        }
    summaries: dict[str, dict[str, int]] = {}
    for finding in findings:
        summary = summaries.setdefault(
            finding.scan_id,
            {"resolved": 0, "rejected": 0, "pending": 0},
        )
        state = resolution_map.get(finding.id)
        if state == ResolutionType.RESOLVED.value:
            summary["resolved"] += 1
        elif state == ResolutionType.REJECTED.value:
            summary["rejected"] += 1
        else:
            summary["pending"] += 1
    return names, summaries
