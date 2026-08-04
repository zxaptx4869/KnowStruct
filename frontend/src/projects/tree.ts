import type { Node } from './types'

export interface TreeNode extends Node {
  children: TreeNode[]
  depth: number
}

export const ROOT_DROP_ID = 'project-root-drop-target'
export type DropIntent = 'before' | 'inside' | 'after' | 'root'

export function indexNodes(nodes: Node[]) {
  return new Map(nodes.map((node) => [node.id, node]))
}

export function buildTree(nodes: Node[]): TreeNode[] {
  const index = new Map<string, TreeNode>()
  for (const node of nodes) {
    if (index.has(node.id)) throw new Error(`Duplicate node id: ${node.id}`)
    index.set(node.id, { ...node, children: [], depth: 1 })
  }

  const roots: TreeNode[] = []
  for (const node of index.values()) {
    if (node.parent_id === null) {
      roots.push(node)
      continue
    }
    const parent = index.get(node.parent_id)
    if (!parent) throw new Error(`Missing parent: ${node.parent_id}`)
    parent.children.push(node)
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  function assignDepth(node: TreeNode, depth: number) {
    if (visiting.has(node.id)) throw new Error('Directory contains a cycle')
    if (visited.has(node.id)) return
    visiting.add(node.id)
    node.depth = depth
    node.children.sort(compareNodes)
    for (const child of node.children) assignDepth(child, depth + 1)
    visiting.delete(node.id)
    visited.add(node.id)
  }

  roots.sort(compareNodes)
  for (const root of roots) assignDepth(root, 1)
  if (visited.size !== nodes.length) throw new Error('Directory contains a cycle')
  return roots
}

export function compareNodes(left: Node, right: Node) {
  return left.sort_order - right.sort_order || left.id.localeCompare(right.id)
}

export function breadcrumbs(nodeId: string | undefined, nodes: Node[]) {
  if (!nodeId) return []
  const index = indexNodes(nodes)
  const result: Node[] = []
  const seen = new Set<string>()
  let current = index.get(nodeId)
  while (current) {
    if (seen.has(current.id)) throw new Error('Directory contains a cycle')
    seen.add(current.id)
    result.unshift(current)
    current = current.parent_id ? index.get(current.parent_id) : undefined
  }
  return result
}

export function descendants(nodeId: string, nodes: Node[]) {
  const children = new Map<string, Node[]>()
  for (const node of nodes) {
    if (node.parent_id) {
      const siblings = children.get(node.parent_id) ?? []
      siblings.push(node)
      children.set(node.parent_id, siblings)
    }
  }
  const result: Node[] = []
  const pending = [...(children.get(nodeId) ?? [])]
  const seen = new Set([nodeId])
  while (pending.length) {
    const node = pending.pop()!
    if (seen.has(node.id)) throw new Error('Directory contains a cycle')
    seen.add(node.id)
    result.push(node)
    pending.push(...(children.get(node.id) ?? []))
  }
  return result
}

export function visibleNodes(roots: TreeNode[], expanded: Set<string>) {
  const result: TreeNode[] = []
  function visit(node: TreeNode) {
    result.push(node)
    if (expanded.has(node.id)) node.children.forEach(visit)
  }
  roots.forEach(visit)
  return result
}

export function childrenOf(parentId: string | null, nodes: Node[]) {
  return nodes.filter((node) => node.parent_id === parentId).sort(compareNodes)
}

export function dropIntentFromGeometry(activeCenterY: number, overTop: number, overHeight: number): Exclude<DropIntent, 'root'> {
  const relativeY = overHeight > 0 ? (activeCenterY - overTop) / overHeight : 0.5
  if (relativeY < 0.3) return 'before'
  if (relativeY > 0.7) return 'after'
  return 'inside'
}

export function moveForDrop(activeId: string, overId: string, nodes: Node[], intent: DropIntent) {
  const active = nodes.find((node) => node.id === activeId)
  if (!active) return null

  if (intent === 'root') {
    if (overId !== ROOT_DROP_ID) return null
    return withoutNoop(active, null, childrenOf(null, nodes).filter((node) => node.id !== active.id).length, nodes)
  }

  const over = nodes.find((node) => node.id === overId)
  if (!over || active.id === over.id) return null

  const parentId = intent === 'inside' ? over.id : over.parent_id
  if (parentId === active.id || descendants(active.id, nodes).some((node) => node.id === parentId)) return null

  const targetSiblings = childrenOf(parentId, nodes).filter((node) => node.id !== active.id)
  const position = intent === 'inside'
    ? targetSiblings.length
    : targetSiblings.findIndex((node) => node.id === over.id) + (intent === 'after' ? 1 : 0)
  if (position < 0) return null
  return withoutNoop(active, parentId, position, nodes)
}

function withoutNoop(active: Node, parentId: string | null, position: number, nodes: Node[]) {
  const currentPosition = childrenOf(active.parent_id, nodes).findIndex((node) => node.id === active.id)
  if (active.parent_id === parentId && currentPosition === position) return null
  return { parent_id: parentId, position }
}
