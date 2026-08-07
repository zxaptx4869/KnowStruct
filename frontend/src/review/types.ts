export type ReviewFindingType =
  | 'missing_source'
  | 'missing_conditions'
  | 'long_pending'
  | 'duplicate'
  | 'conflict'

export type ReviewTargetType = 'entry' | 'source' | 'ai_finding'

export type ReviewResolutionKind = 'resolved' | 'ignored'

export type ReviewStatus = 'open' | 'resolved'

export interface ReviewFinding {
  finding_type: ReviewFindingType
  target_type: ReviewTargetType
  target_id: string
  title: string
  summary: string
  created_at: string | null
  entry_type?: string | null
  content?: string | null
  conditions?: string[] | null
  project_id?: string | null
  project_name?: string | null
  node_id?: string | null
  node_path?: string[]
  source_type?: string | null
  link_url?: string | null
  pending_count?: number | null
  entry_b_id?: string | null
  entry_b_title?: string | null
  entry_b_content?: string | null
  entry_b_project_id?: string | null
  entry_b_node_id?: string | null
  ai_description?: string | null
  ai_suggestion?: string | null
  ai_severity?: string | null
  resolution?: ReviewResolutionKind | null
  note?: string | null
  resolved_at?: string | null
}

export interface ReviewFindingsResponse {
  findings: ReviewFinding[]
}

export interface ReviewResolutionInput {
  resolution: ReviewResolutionKind
  note?: string
}

export interface ReviewResolutionResult {
  removed?: boolean
}

export type ReviewScopeType = 'workspace' | 'project' | 'node'

export interface ReviewScopeSelection {
  project_id?: string | null
  node_id?: string | null
}

export interface ReviewScan {
  id: string
  scope_type: ReviewScopeType
  scope_id: string | null
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  truncated: boolean
  findings_count: number
  resurfaced_count: number
  last_error: string | null
  started_at: string | null
  created_at: string | null
  finished_at: string | null
}

export interface ReviewScanListResponse {
  scans: ReviewScan[]
}

export interface ReviewAiEntryRef {
  id: string
  title: string
  content: string
  entry_type: string
  project_id: string | null
  project_name: string | null
  node_id: string | null
  node_path: string[]
}

export interface ReviewCandidate {
  id: string
  review_type: ReviewFindingType
  status: string
  description: string
  suggestion: string | null
  severity: string
  entry_a: ReviewAiEntryRef
  entry_b: ReviewAiEntryRef
}

export interface ReviewCandidatesResponse {
  candidates: ReviewCandidate[]
}
