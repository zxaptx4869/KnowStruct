import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { SearchResponse } from './types'

export const searchKeys = {
  all: ['search'] as const,
  query: (keyword: string, filters: SearchFilters) =>
    ['search', keyword, filters.project ?? '', filters.type ?? '', filters.node ?? ''] as const,
}

export interface SearchFilters {
  project?: string
  type?: string
  node?: string
}

export function useSearch(keyword: string, filters: SearchFilters = {}) {
  const trimmed = keyword.trim()
  return useQuery({
    queryKey: searchKeys.query(trimmed, filters),
    queryFn: () =>
      api.get<SearchResponse>('/search', {
        params: {
          ...(trimmed ? { q: trimmed } : {}),
          ...(filters.project ? { project: filters.project } : {}),
          ...(filters.type ? { type: filters.type } : {}),
          ...(filters.node ? { node: filters.node } : {}),
        },
      }),
    enabled: trimmed.length > 0,
    staleTime: 0,
  })
}
