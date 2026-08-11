import type { Node } from '../projects/types'

export interface PathResolution {
  /** 全路径匹配到的现有节点；未全匹配时为 null */
  matched: Node | null
  /** 已匹配的前缀祖先（不含 matched 自身） */
  prefixNodes: Node[]
  /** 第一个缺失段起的新建路径段 */
  missing: string[]
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

/**
 * 把「家具家电 / 大家电 / 冰箱」形式的建议路径按现有目录逐段匹配。
 * 匹配使用标准化名称（忽略大小写与首尾空白）；同层多个候选时优先名称完全相等，
 * 否则取第一个（末段唯一宽容）。
 */
export function resolveSuggestedPath(
  path: string,
  nodes: Node[],
): PathResolution {
  // 防御旧数据/模型输出带「建议新建：」前缀
  const cleanPath = path.replace(/^\s*建议新建\s*[：:]\s*/, '').trim()
  const segments = cleanPath
    .split('/')
    // 路径段可能误带「：说明」后缀（模型混淆目录格式），剥离后只匹配名称
    .map((segment) => segment.split(/[：:]/)[0].trim())
    .map((segment) => segment.trim())
    .filter(Boolean)
  if (segments.length === 0) {
    return { matched: null, prefixNodes: [], missing: [] }
  }
  const prefixNodes: Node[] = []
  let parentId: string | null = null
  let index = 0
  for (; index < segments.length; index += 1) {
    const candidates = nodes.filter(
      (node) =>
        node.parent_id === parentId
        && normalizeName(node.name) === normalizeName(segments[index]),
    )
    if (candidates.length === 0) break
    const exact = candidates.find((node) => node.name.trim() === segments[index])
    const node = exact ?? candidates[0]
    prefixNodes.push(node)
    parentId = node.id
  }
  if (index === segments.length) {
    const matched = prefixNodes[prefixNodes.length - 1] ?? null
    return {
      matched,
      prefixNodes: matched ? prefixNodes.slice(0, -1) : prefixNodes,
      missing: [],
    }
  }
  return { matched: null, prefixNodes, missing: segments.slice(index) }
}
