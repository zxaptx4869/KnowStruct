"""Transactional operations for project knowledge-directory nodes."""

from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ConflictError, ResourceNotFoundError
from app.models import Entry, Node, Project
from app.schemas.projects import NodeCreate, NodeMove, NodeUpdate
from app.services.projects import get_project
from app.utils.tree import (
    MAX_TREE_DEPTH,
    descendant_ids,
    index_nodes,
    node_depth,
    normalize_node_name,
    ordered_children,
    sibling_scope,
    subtree_height,
)


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def touch_project(project: Project) -> None:
    project.updated_at = utc_now()


async def list_nodes(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    *,
    for_update: bool = False,
) -> tuple[Project, list[Node]]:
    project = await get_project(db, workspace_id, project_id, for_update=for_update)
    query = select(Node).where(Node.project_id == project.id)
    if for_update:
        query = query.with_for_update()
    nodes = list((await db.scalars(query)).all())
    nodes.sort(key=lambda node: (node.parent_id or "", node.sort_order, node.id))
    return project, nodes


def find_node(nodes: list[Node], node_id: str) -> Node:
    node = next((candidate for candidate in nodes if candidate.id == node_id), None)
    if node is None:
        raise ResourceNotFoundError("node")
    return node


def ensure_parent(nodes: list[Node], parent_id: str | None) -> Node | None:
    if parent_id is None:
        return None
    return find_node(nodes, parent_id)


def ensure_unique_sibling_name(
    nodes: list[Node],
    parent_id: str | None,
    normalized_name: str,
    *,
    exclude_id: str | None = None,
) -> None:
    if any(
        node.parent_id == parent_id
        and node.normalized_name == normalized_name
        and node.id != exclude_id
        for node in nodes
    ):
        raise ConflictError("duplicate_node_name", "同级目录中已存在同名节点")


async def flush_node_name(db: AsyncSession) -> None:
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError("duplicate_node_name", "同级目录中已存在同名节点") from exc


async def create_node(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    payload: NodeCreate,
) -> Node:
    project, nodes = await list_nodes(db, workspace_id, project_id, for_update=True)
    parent = ensure_parent(nodes, payload.parent_id)
    if parent is not None and node_depth(parent.id, index_nodes(nodes)) >= MAX_TREE_DEPTH:
        raise ConflictError("node_depth_exceeded", "知识目录最多支持 6 层")

    normalized_name = normalize_node_name(payload.name)
    ensure_unique_sibling_name(nodes, payload.parent_id, normalized_name)
    siblings = ordered_children(nodes, payload.parent_id)
    node = Node(
        project_id=project.id,
        parent_id=payload.parent_id,
        sibling_scope=sibling_scope(project.id, payload.parent_id),
        name=payload.name,
        normalized_name=normalized_name,
        description=payload.description,
        sort_order=len(siblings),
    )
    db.add(node)
    touch_project(project)
    await flush_node_name(db)
    return node


async def update_node(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    node_id: str,
    payload: NodeUpdate,
) -> Node:
    project, nodes = await list_nodes(db, workspace_id, project_id, for_update=True)
    node = find_node(nodes, node_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        normalized_name = normalize_node_name(changes["name"])
        ensure_unique_sibling_name(
            nodes,
            node.parent_id,
            normalized_name,
            exclude_id=node.id,
        )
        node.name = changes["name"]
        node.normalized_name = normalized_name
    if "description" in changes:
        node.description = changes["description"]
    touch_project(project)
    await flush_node_name(db)
    return node


async def move_node(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    node_id: str,
    payload: NodeMove,
) -> Node:
    project, nodes = await list_nodes(db, workspace_id, project_id, for_update=True)
    node = find_node(nodes, node_id)
    parent = ensure_parent(nodes, payload.parent_id)
    descendants = set(descendant_ids(node.id, nodes))
    if payload.parent_id == node.id or payload.parent_id in descendants:
        raise ConflictError("cyclic_node_move", "不能将节点移动到自身或其子节点下")

    new_depth = 1 if parent is None else node_depth(parent.id, index_nodes(nodes)) + 1
    if new_depth + subtree_height(node.id, nodes) - 1 > MAX_TREE_DEPTH:
        raise ConflictError("node_depth_exceeded", "移动后的知识目录会超过 6 层")

    ensure_unique_sibling_name(
        nodes,
        payload.parent_id,
        node.normalized_name,
        exclude_id=node.id,
    )
    target_siblings = [
        sibling
        for sibling in ordered_children(nodes, payload.parent_id)
        if sibling.id != node.id
    ]
    if payload.position > len(target_siblings):
        raise ConflictError("invalid_node_position", "目标排序位置无效")

    old_parent_id = node.parent_id
    if old_parent_id != payload.parent_id:
        old_siblings = [
            sibling
            for sibling in ordered_children(nodes, old_parent_id)
            if sibling.id != node.id
        ]
        for index, sibling in enumerate(old_siblings):
            sibling.sort_order = index

    node.parent_id = payload.parent_id
    node.sibling_scope = sibling_scope(project.id, payload.parent_id)
    target_siblings.insert(payload.position, node)
    for index, sibling in enumerate(target_siblings):
        sibling.sort_order = index

    touch_project(project)
    await flush_node_name(db)
    return node


async def count_protected_node_references(
    db: AsyncSession,
    project_id: str,
    node_ids: list[str],
) -> int:
    if not node_ids:
        return 0
    count = await db.scalar(
        select(func.count(Entry.id)).where(Entry.node_id.in_(node_ids))
    )
    return int(count or 0)


async def delete_node_subtree(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    node_id: str,
) -> tuple[int, str | None]:
    project, nodes = await list_nodes(db, workspace_id, project_id, for_update=True)
    node = find_node(nodes, node_id)
    deleted_ids = [node.id, *descendant_ids(node.id, nodes)]
    blockers = await count_protected_node_references(db, project.id, deleted_ids)
    if blockers:
        raise ConflictError(
            "node_has_protected_content",
            "目录包含受保护的正式内容，无法删除",
            blocker_count=blockers,
        )

    await db.execute(delete(Node).where(Node.id.in_(deleted_ids)))
    remaining_siblings = [
        sibling
        for sibling in ordered_children(nodes, node.parent_id)
        if sibling.id not in deleted_ids
    ]
    for index, sibling in enumerate(remaining_siblings):
        sibling.sort_order = index
    touch_project(project)
    await db.flush()
    return len(deleted_ids), node.parent_id
