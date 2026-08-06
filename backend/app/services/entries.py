"""Formal entry queries for directory browsing and source tracing."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ResourceNotFoundError
from app.models import Entry, EntrySource, Node, Source
from app.schemas.projects import NodeEntryResponse, NodeEntrySourceRef
from app.services.projects import get_project

NODE_ENTRY_LIMIT = 200
MAX_ENTRY_SOURCES = 3


async def _scoped_node(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    node_id: str,
) -> Node:
    await get_project(db, workspace_id, project_id)
    node = await db.scalar(
        select(Node).where(Node.id == node_id, Node.project_id == project_id)
    )
    if node is None:
        raise ResourceNotFoundError("node")
    return node


async def _load_entry_sources(
    db: AsyncSession,
    workspace_id: str,
    entry_ids: list[str],
) -> dict[str, list[NodeEntrySourceRef]]:
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
    grouped: dict[str, list[NodeEntrySourceRef]] = {
        entry_id: [] for entry_id in entry_ids
    }
    for entry_id, source_id, source_type, title in rows.all():
        refs = grouped[entry_id]
        if len(refs) >= MAX_ENTRY_SOURCES:
            continue
        refs.append(
            NodeEntrySourceRef(id=source_id, source_type=source_type, title=title)
        )
    return grouped


async def entry_counts_by_node(
    db: AsyncSession,
    workspace_id: str,
    node_ids: list[str],
) -> dict[str, int]:
    if not node_ids:
        return {}
    rows = await db.execute(
        select(Entry.node_id, func.count(Entry.id))
        .where(
            Entry.workspace_id == workspace_id,
            Entry.node_id.in_(node_ids),
            Entry.status == "archived",
        )
        .group_by(Entry.node_id)
    )
    return {node_id: int(count) for node_id, count in rows.all()}


async def list_node_entries(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    node_id: str,
) -> list[NodeEntryResponse]:
    await _scoped_node(db, workspace_id, project_id, node_id)
    entries = (
        await db.scalars(
            select(Entry)
            .where(
                Entry.node_id == node_id,
                Entry.workspace_id == workspace_id,
                Entry.status == "archived",
            )
            .order_by(Entry.created_at.desc(), Entry.id.desc())
            .limit(NODE_ENTRY_LIMIT)
        )
    ).all()
    entry_ids = [entry.id for entry in entries]
    sources = await _load_entry_sources(db, workspace_id, entry_ids)
    return [
        NodeEntryResponse(
            id=entry.id,
            entry_type=entry.entry_type,
            title=entry.title,
            content=entry.content,
            applicable_conditions=entry.applicable_conditions,
            sources=sources.get(entry.id, []),
            created_at=entry.created_at,
        )
        for entry in entries
    ]
