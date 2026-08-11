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

export interface DraftMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

export type DiffKind = 'added' | 'kept' | 'removed'

export interface ExpansionDiffEntry {
  kind: DiffKind
  node: {
    id: string
    name: string
    description: string | null
    selected: boolean
  } | null
  real_node_id: string | null
  name: string | null
  description: string | null
  blocked: boolean
  blocker_count: number
  children: ExpansionDiffEntry[]
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
  target_node_id: string | null
  status: DraftStatus
  next_action: 'clarify' | 'generate' | 'refine'
  intent_note: string | null
  clarify: DraftQuestion[]
  diff: ExpansionDiffEntry[]
  nodes: DraftNode[]
  messages: DraftMessage[]
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

export interface DraftChatResponse {
  draft: DirectoryDraft
  messages: DraftMessage[]
}
