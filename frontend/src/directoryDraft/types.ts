export interface DraftNode {
  id: string
  parent_id: string | null
  name: string
  description: string | null
  selected: boolean
  sort_order: number
}

export interface DraftQuestion {
  id: string
  text: string
  options: string[]
  multiple: boolean
}

export type DraftStatus =
  | 'drafting'
  | 'awaiting_input'
  | 'pending_confirm'
  | 'failed'
  | 'confirmed'
  | 'discarded'

export interface DirectoryDraft {
  id: string
  project_id: string
  status: DraftStatus
  next_action: 'clarify' | 'generate' | 'refine'
  intent_note: string | null
  clarify: DraftQuestion[]
  nodes: DraftNode[]
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface DraftEnvelope {
  draft: DirectoryDraft | null
}

export interface DraftConfirmResult {
  created_count: number
  status: DraftStatus
}
