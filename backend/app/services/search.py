"""Workspace-scoped global keyword search over entries and sources."""

from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import DomainError
from app.models import Entry, EntrySource, Node, Project, Source
from app.schemas.search import EntryHit, SourceHit, SourceRef

MAX_SEARCH_QUERY_LENGTH = 100
SEARCH_RESULT_LIMIT = 50
MAX_ENTRY_SOURCES = 3


def escape_like(value: str) -> str:
    r"""转义 LIKE 通配符，使 `%`、`_`、`\` 按字面匹配。"""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def validate_query(q: str) -> str:
    keyword = q.strip()
    if not keyword:
        raise DomainError(422, "empty_query", "请输入搜索关键词")
    if len(keyword) > MAX_SEARCH_QUERY_LENGTH:
        raise DomainError(422, "query_too_long", "关键词不能超过 100 字符")
    return keyword


def _pattern(keyword: str) -> str:
    return f"%{escape_like(keyword)}%"


@dataclass(frozen=True)
class SearchResultData:
    entries: list[EntryHit]
    sources: list[SourceHit]


async def _load_project_names(
    db: AsyncSession,
    workspace_id: str,
    project_ids: set[str],
) -> dict[str, str]:
    if not project_ids:
        return {}
    projects = (
        await db.scalars(
            select(Project).where(
                Project.id.in_(project_ids),
                Project.workspace_id == workspace_id,
            )
        )
    ).all()
    return {project.id: project.name for project in projects}


async def _load_node_paths(
    db: AsyncSession,
    project_ids: set[str],
) -> dict[str, list[str]]:
    """node_id -> 从根到该节点的名称路径；异常或缺失父链时返回空列表。"""
    if not project_ids:
        return {}
    nodes = (
        await db.scalars(select(Node).where(Node.project_id.in_(project_ids)))
    ).all()
    index = {node.id: node for node in nodes}

    def path_of(node_id: str) -> list[str]:
        names: list[str] = []
        seen: set[str] = set()
        current: str | None = node_id
        while current:
            if current in seen or len(names) > 6:
                return []
            seen.add(current)
            node = index.get(current)
            if node is None:
                break
            names.append(node.name)
            current = node.parent_id
        return list(reversed(names))

    return {node.id: path_of(node.id) for node in nodes}


async def _load_entry_sources(
    db: AsyncSession,
    workspace_id: str,
    entry_ids: list[str],
) -> dict[str, list[SourceRef]]:
    if not entry_ids:
        return {}
    rows = await db.execute(
        select(EntrySource.entry_id, Source.id, Source.source_type, Source.title)
        .join(Source, Source.id == EntrySource.source_id)
        .where(
            EntrySource.entry_id.in_(entry_ids),
            Source.workspace_id == workspace_id,
        )
        .order_by(Source.created_at, Source.id)
    )
    grouped: dict[str, list[SourceRef]] = {entry_id: [] for entry_id in entry_ids}
    for entry_id, source_id, source_type, title in rows.all():
        refs = grouped[entry_id]
        if len(refs) >= MAX_ENTRY_SOURCES:
            continue
        refs.append(SourceRef(id=source_id, source_type=source_type, title=title))
    return grouped


async def _load_source_entry_counts(
    db: AsyncSession,
    workspace_id: str,
    source_ids: list[str],
) -> dict[str, int]:
    if not source_ids:
        return {}
    rows = await db.execute(
        select(EntrySource.source_id, func.count(EntrySource.entry_id))
        .join(Entry, Entry.id == EntrySource.entry_id)
        .where(
            EntrySource.source_id.in_(source_ids),
            Entry.workspace_id == workspace_id,
            Entry.status == "archived",
        )
        .group_by(EntrySource.source_id)
    )
    counts = {source_id: 0 for source_id in source_ids}
    for source_id, count in rows.all():
        counts[source_id] = int(count)
    return counts


async def search(
    db: AsyncSession,
    workspace_id: str,
    q: str,
) -> SearchResultData:
    keyword = validate_query(q)
    pattern = _pattern(keyword)

    entry_rows = (
        await db.execute(
            select(Entry, Project.name)
            .join(Project, Project.id == Entry.project_id)
            .where(
                Entry.workspace_id == workspace_id,
                Entry.status == "archived",
                or_(
                    Entry.title.like(pattern, escape="\\"),
                    Entry.content.like(pattern, escape="\\"),
                ),
            )
            .order_by(Entry.created_at.desc(), Entry.id.desc())
            .limit(SEARCH_RESULT_LIMIT)
        )
    ).all()
    entries = [row[0] for row in entry_rows]
    entry_project_names = {row[0].id: row[1] for row in entry_rows}

    source_rows = (
        await db.execute(
            select(Source, Project.name)
            .outerjoin(Project, Project.id == Source.project_id)
            .where(
                Source.workspace_id == workspace_id,
                or_(
                    Source.title.like(pattern, escape="\\"),
                    Source.content.like(pattern, escape="\\"),
                    Source.link_url.like(pattern, escape="\\"),
                ),
            )
            .order_by(Source.created_at.desc(), Source.id.desc())
            .limit(SEARCH_RESULT_LIMIT)
        )
    ).all()
    sources = [row[0] for row in source_rows]
    source_project_names = {row[0].id: row[1] for row in source_rows}

    entry_ids = [entry.id for entry in entries]
    source_ids = [source.id for source in sources]
    project_ids = {
        entry.project_id for entry in entries
    } | {source.project_id for source in sources if source.project_id}
    project_names = await _load_project_names(db, workspace_id, project_ids)
    node_paths = await _load_node_paths(db, {entry.project_id for entry in entries})
    entry_sources = await _load_entry_sources(db, workspace_id, entry_ids)
    entry_counts = await _load_source_entry_counts(db, workspace_id, source_ids)

    entry_hits = [
        EntryHit(
            id=entry.id,
            entry_type=entry.entry_type,
            title=entry.title,
            content=entry.content,
            project_id=entry.project_id,
            project_name=entry_project_names.get(entry.id) or project_names.get(entry.project_id, ""),
            node_id=entry.node_id,
            node_path=node_paths.get(entry.node_id or "", []) if entry.node_id else [],
            sources=entry_sources.get(entry.id, []),
            created_at=entry.created_at,
        )
        for entry in entries
    ]
    source_hits = [
        SourceHit(
            id=source.id,
            source_type=source.source_type,
            title=source.title,
            content=source.content,
            link_url=source.link_url,
            project_id=source.project_id,
            project_name=source_project_names.get(source.id) or (
                project_names.get(source.project_id) if source.project_id else None
            ),
            entry_count=entry_counts.get(source.id, 0),
            created_at=source.created_at,
        )
        for source in sources
    ]
    return SearchResultData(entries=entry_hits, sources=source_hits)
