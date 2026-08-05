export type SourceType = 'text' | 'link'
export type ProcessingState = 'processing' | 'failed' | 'pending_confirm' | 'done'
export type ExtractionStatus = 'pending_confirm' | 'accepted' | 'rejected'
export type EntryType =
  | 'experience'
  | 'parameter'
  | 'pitfall'
  | 'product'
  | 'price'
  | 'decision'
  | 'todo'
  | 'question'

export interface CandidateCounts {
  pending_confirm: number
  accepted: number
  rejected: number
}

export interface TaskInfo {
  stage: string
  status: string
  attempt_count: number
  last_error: string | null
  claimed_at: string | null
  started_at: string | null
  finished_at: string | null
}

export interface SourceItem {
  id: string
  source_type: SourceType
  title: string
  content: string
  link_url: string | null
  content_status: string
  project_id: string | null
  project_name: string | null
  processing_state: ProcessingState
  candidates: CandidateCounts
  task: TaskInfo | null
  created_at: string
  updated_at: string
}

export interface Extraction {
  id: string
  source_id: string
  status: ExtractionStatus
  title: string
  content: string
  entry_type: string
  suggested_node_path: string | null
  applicable_conditions: string[] | null
  risk_points: string[] | null
  confidence: number | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

export interface SourceDetail extends SourceItem {
  extractions: Extraction[]
}

export interface SourceCreateInput {
  source_type: SourceType
  content?: string
  link_url?: string
  project_id?: string
}

export interface DecideInput {
  decision: 'accepted' | 'rejected'
  project_id?: string
  node_id?: string
  title?: string
  content?: string
  entry_type?: EntryType
  applicable_conditions?: string[]
}

export interface EntrySummary {
  id: string
  project_id: string
  node_id: string | null
  entry_type: string
  title: string
  status: string
  created_at: string
}

export interface DecideResponse {
  decision: 'accepted' | 'rejected'
  extraction_id: string
  entry: EntrySummary | null
}

export interface CompleteResponse {
  total: number
  pending_confirm: number
  accepted: number
  rejected: number
  completed: boolean
}

export interface SourceListParams {
  state?: ProcessingState
  source_type?: SourceType
  project_id?: string
  q?: string
}
