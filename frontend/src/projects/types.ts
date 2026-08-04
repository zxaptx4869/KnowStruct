export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed'

export interface Project {
  id: string
  name: string
  goal: string | null
  background: string | null
  status: ProjectStatus
  node_count: number
  created_at: string
  updated_at: string
}

export interface ProjectInput {
  name: string
  goal?: string | null
  background?: string | null
  status?: ProjectStatus
}

export interface Node {
  id: string
  project_id: string
  parent_id: string | null
  name: string
  description: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface NodeInput {
  name: string
  description?: string | null
  parent_id?: string | null
}

export interface NodeMoveInput {
  parent_id: string | null
  position: number
}

export interface NodeDeleteResult {
  deleted_count: number
  parent_id: string | null
}

export const projectStatuses: Array<{ value: ProjectStatus, label: string }> = [
  { value: 'planning', label: '规划中' },
  { value: 'active', label: '进行中' },
  { value: 'paused', label: '已暂停' },
  { value: 'completed', label: '已完成' },
]

export function projectStatusLabel(status: ProjectStatus) {
  return projectStatuses.find((item) => item.value === status)?.label ?? status
}
