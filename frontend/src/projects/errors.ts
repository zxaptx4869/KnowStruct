import { ApiError } from '../lib/api'

const messages: Record<string, string> = {
  duplicate_node_name: '同级目录中已存在同名节点',
  node_depth_exceeded: '知识目录最多支持 6 层',
  cyclic_node_move: '不能将节点移到自身或其子节点下',
  invalid_node_position: '目标排序位置无效',
  project_has_protected_content: '项目包含受保护内容，无法删除',
  node_has_protected_content: '目录包含受保护内容，无法删除',
  project_not_found: '项目不存在或已被删除',
  node_not_found: '目录节点不存在或已被删除',
}

export function mutationMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return messages[error.code] ?? error.message
  return fallback
}
