import { describe, expect, it } from 'vitest'
import type { Node } from '../projects/types'
import { resolveSuggestedPath } from './suggestedPath'

function node(id: string, name: string, parent_id: string | null): Node {
  return {
    id,
    project_id: 'project-1',
    name,
    parent_id,
    description: null,
    sort_order: 0,
    entry_count: 0,
    created_at: '',
    updated_at: '',
  }
}

const nodes: Node[] = [
  node('r1', '家具家电', null),
  node('r2', '硬装施工', null),
  node('c1', '大家电', 'r1'),
  node('c2', '冰箱', 'c1'),
  node('c3', '客厅家具', 'r1'),
]

describe('resolveSuggestedPath', () => {
  it('matches the full path case-insensitively', () => {
    const result = resolveSuggestedPath('家具家电 / 大家电 / 冰箱', nodes)
    expect(result.matched?.id).toBe('c2')
    expect(result.prefixNodes.map((item) => item.id)).toEqual(['r1', 'c1'])
    expect(result.missing).toEqual([])
  })

  it('returns missing segments for a partial match', () => {
    const result = resolveSuggestedPath('家具家电 / 大家电 / 洗衣机', nodes)
    expect(result.matched).toBeNull()
    expect(result.prefixNodes.map((item) => item.id)).toEqual(['r1', 'c1'])
    expect(result.missing).toEqual(['洗衣机'])
  })

  it('returns all segments as missing when nothing matches', () => {
    const result = resolveSuggestedPath('软装 / 窗帘', nodes)
    expect(result.matched).toBeNull()
    expect(result.prefixNodes).toEqual([])
    expect(result.missing).toEqual(['软装', '窗帘'])
  })

  it('ignores whitespace and empty segments', () => {
    const result = resolveSuggestedPath(' 家具家电 /大家电/ 冰箱 ', nodes)
    expect(result.matched?.id).toBe('c2')
  })

  it('prefers the exact name when siblings share a normalized name', () => {
    const mixed = [
      ...nodes,
      node('c4', '冰箱', 'c1'),
      node('c5', '冰箱', 'c1'),
    ]
    const result = resolveSuggestedPath('家具家电 / 大家电 / 冰箱', mixed)
    expect(result.matched?.id).toBe('c2')
  })

  it('strips a leading 建议新建 prefix before parsing', () => {
    const result = resolveSuggestedPath('建议新建：软装 / 窗帘', nodes)
    expect(result.matched).toBeNull()
    expect(result.prefixNodes).toEqual([])
    expect(result.missing).toEqual(['软装', '窗帘'])
  })

  it('does not treat a 建议新建 prefix as a node name', () => {
    const result = resolveSuggestedPath('建议新建：家具家电 / 大家电 / 冰箱', nodes)
    expect(result.matched?.id).toBe('c2')
    expect(result.missing).toEqual([])
  })

  it('strips a description suffix from path segments', () => {
    const result = resolveSuggestedPath(
      '家具家电 / 大家电 / 冰箱：零嵌冰箱选购注意事项',
      nodes,
    )
    expect(result.matched?.id).toBe('c2')
    expect(result.missing).toEqual([])
  })
})
