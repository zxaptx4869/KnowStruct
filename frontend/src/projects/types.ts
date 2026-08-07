import type { SourceType } from '../inbox/types'

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed'

export interface Project {
  id: string
  name: string
  goal: string | null
  background: string | null
  status: ProjectStatus
  node_count: number
  entry_count: number
  unarchived_entry_count: number
  created_at: string
  updated_at: string
}

export interface ProjectInput {
  name: string
  goal?: string | null
  status?: ProjectStatus
}

export interface Node {
  id: string
  project_id: string
  parent_id: string | null
  name: string
  description: string | null
  sort_order: number
  entry_count: number
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

export interface NodeEntrySourceRef {
  id: string
  source_type: SourceType
  title: string
}

export interface NodeEntry {
  id: string
  entry_type: string
  title: string
  content: string
  applicable_conditions: string[] | null
  node_id: string | null
  node_path: string[]
  sources: NodeEntrySourceRef[]
  created_at: string
}

export interface EntryUpdateInput {
  title?: string
  content?: string
  entry_type?: string
  applicable_conditions?: string[] | null
  node_id?: string | null
}

export interface ProjectRecords {
  items: NodeEntry[]
  total: number
  unarchived_count: number
}

export interface BatchEntryMoveInput {
  entry_ids: string[]
  node_id: string | null
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
