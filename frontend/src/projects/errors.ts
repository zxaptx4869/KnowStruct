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
  task_not_failed: '只有失败的任务可以从失败步骤重试',
  source_already_assigned: '包含已分配的资料，请只选择未分配的资料',
  source_has_protected_entries: '包含已被正式记录引用的资料，无法执行该操作',
  task_running: '包含正在处理中的资料，无法执行该操作',
  invalid_batch: '批量操作需要 1-100 条资料',
  task_not_completed: '资料仍在处理中或处理失败，无法完成',
  project_required: '接受候选前必须确认项目',
  invalid_node_for_project: '归档节点不属于所选项目',
  extraction_already_decided: '该候选已决定，不能重复更改',
  pending_extractions: '还有候选未决定，请先逐条确认',
}

export function mutationMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return messages[error.code] ?? error.message
  return fallback
}
