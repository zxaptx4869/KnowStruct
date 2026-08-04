import { describe, expect, it } from 'vitest'
import {
  ROOT_DROP_ID,
  breadcrumbs,
  buildTree,
  childrenOf,
  descendants,
  dropIntentFromGeometry,
  moveForDrop,
  visibleNodes,
} from './tree'
import type { Node } from './types'

const timestamp = '2026-08-04T10:00:00'
const nodes: Node[] = [
  node('furniture', null, '家具家电', 1),
  node('construction', null, '硬装施工', 0),
  node('appliances', 'furniture', '大家电', 0),
  node('fridge', 'appliances', '冰箱', 1),
  node('washer', 'appliances', '洗衣机', 0),
]

function node(id: string, parent_id: string | null, name: string, sort_order: number): Node {
  return {
    id,
    project_id: 'project-1',
    parent_id,
    name,
    description: null,
    sort_order,
    created_at: timestamp,
    updated_at: timestamp,
  }
}

describe('project directory selectors', () => {
  it('builds an ordered tree and visible rows by stable ids', () => {
    const roots = buildTree(nodes)
    expect(roots.map((item) => item.id)).toEqual(['construction', 'furniture'])
    expect(roots[1].children[0].children.map((item) => item.id)).toEqual(['washer', 'fridge'])
    expect(visibleNodes(roots, new Set(['furniture', 'appliances'])).map((item) => item.id)).toEqual([
      'construction', 'furniture', 'appliances', 'washer', 'fridge',
    ])
  })

  it('derives breadcrumbs, descendants, and current-level children', () => {
    expect(breadcrumbs('fridge', nodes).map((item) => item.name)).toEqual(['家具家电', '大家电', '冰箱'])
    expect(new Set(descendants('furniture', nodes).map((item) => item.id))).toEqual(new Set(['appliances', 'fridge', 'washer']))
    expect(childrenOf('appliances', nodes).map((item) => item.id)).toEqual(['washer', 'fridge'])
  })

  it('maps row edges, row centers, and the root target to the move API', () => {
    expect(moveForDrop('fridge', 'washer', nodes, 'before')).toEqual({ parent_id: 'appliances', position: 0 })
    expect(moveForDrop('washer', 'fridge', nodes, 'after')).toEqual({ parent_id: 'appliances', position: 1 })
    expect(moveForDrop('fridge', 'construction', nodes, 'inside')).toEqual({ parent_id: 'construction', position: 0 })
    expect(moveForDrop('fridge', ROOT_DROP_ID, nodes, 'root')).toEqual({ parent_id: null, position: 2 })
  })

  it('derives before, inside, and after intent from row geometry', () => {
    expect(dropIntentFromGeometry(5, 0, 30)).toBe('before')
    expect(dropIntentFromGeometry(15, 0, 30)).toBe('inside')
    expect(dropIntentFromGeometry(25, 0, 30)).toBe('after')
  })

  it('rejects cyclic and no-op drops before calling the API', () => {
    expect(moveForDrop('furniture', 'fridge', nodes, 'inside')).toBeNull()
    expect(moveForDrop('construction', 'furniture', nodes, 'before')).toBeNull()
    expect(moveForDrop('construction', ROOT_DROP_ID, nodes, 'root')).toEqual({ parent_id: null, position: 1 })
    expect(moveForDrop('furniture', ROOT_DROP_ID, nodes, 'root')).toBeNull()
  })

  it('rejects malformed missing-parent and cyclic data', () => {
    expect(() => buildTree([node('orphan', 'missing', '孤立节点', 0)])).toThrow('Missing parent')
    expect(() => buildTree([
      node('one', 'two', '一', 0),
      node('two', 'one', '二', 0),
    ])).toThrow('cycle')
  })
})
