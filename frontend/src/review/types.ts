export type ReviewFindingType =
  | 'missing_source'
  | 'missing_conditions'
  | 'long_pending'

export type ReviewTargetType = 'entry' | 'source'

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
