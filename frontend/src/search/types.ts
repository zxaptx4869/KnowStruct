export type SearchSourceType = 'text' | 'link' | 'image'

export interface SearchSourceRef {
  id: string
  source_type: SearchSourceType
  title: string
}

export interface SearchEntryHit {
  id: string
  entry_type: string
  title: string
  content: string
  project_id: string
  project_name: string
  node_id: string | null
  node_path: string[]
  sources: SearchSourceRef[]
  created_at: string
}

export interface SearchSourceHit {
  id: string
  source_type: SearchSourceType
  title: string
  content: string | null
  link_url: string | null
  project_id: string | null
  project_name: string | null
  entry_count: number
  created_at: string
}

export interface SearchResponse {
  entries: SearchEntryHit[]
  sources: SearchSourceHit[]
}
