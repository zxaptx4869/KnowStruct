"""Pure helpers for ID-based adjacency-list directory trees."""

from collections.abc import Iterable, Mapping
from typing import Protocol

MAX_TREE_DEPTH = 6


class TreeNode(Protocol):
    id: str
    parent_id: str | None
    sort_order: int


def normalize_node_name(name: str) -> str:
    return name.strip().casefold()


def sibling_scope(project_id: str, parent_id: str | None) -> str:
    return f"node:{parent_id}" if parent_id else f"project:{project_id}"


def index_nodes(nodes: Iterable[TreeNode]) -> dict[str, TreeNode]:
    return {node.id: node for node in nodes}


def ancestor_ids(node_id: str, nodes_by_id: Mapping[str, TreeNode]) -> list[str]:
    ancestors: list[str] = []
    current = nodes_by_id.get(node_id)
    seen = {node_id}
    while current is not None and current.parent_id is not None:
        if current.parent_id in seen:
            raise ValueError("Directory contains a cycle")
        seen.add(current.parent_id)
        ancestors.append(current.parent_id)
        current = nodes_by_id.get(current.parent_id)
    return ancestors


def node_depth(node_id: str, nodes_by_id: Mapping[str, TreeNode]) -> int:
    return len(ancestor_ids(node_id, nodes_by_id)) + 1


def descendant_ids(node_id: str, nodes: Iterable[TreeNode]) -> list[str]:
    children: dict[str, list[str]] = {}
    for node in nodes:
        if node.parent_id is not None:
            children.setdefault(node.parent_id, []).append(node.id)

    descendants: list[str] = []
    pending = list(children.get(node_id, []))
    seen = {node_id}
    while pending:
        descendant_id = pending.pop()
        if descendant_id in seen:
            raise ValueError("Directory contains a cycle")
        seen.add(descendant_id)
        descendants.append(descendant_id)
        pending.extend(children.get(descendant_id, []))
    return descendants


def subtree_height(node_id: str, nodes: Iterable[TreeNode]) -> int:
    children: dict[str, list[str]] = {}
    for node in nodes:
        if node.parent_id is not None:
            children.setdefault(node.parent_id, []).append(node.id)

    def height(current_id: str, visiting: set[str]) -> int:
        if current_id in visiting:
            raise ValueError("Directory contains a cycle")
        child_ids = children.get(current_id, [])
        if not child_ids:
            return 1
        next_visiting = {*visiting, current_id}
        return 1 + max(height(child_id, next_visiting) for child_id in child_ids)

    return height(node_id, set())


def ordered_children(nodes: Iterable[TreeNode], parent_id: str | None) -> list[TreeNode]:
    return sorted(
        (node for node in nodes if node.parent_id == parent_id),
        key=lambda node: (node.sort_order, node.id),
    )
