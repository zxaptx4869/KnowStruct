import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { SearchResponse } from './types'

export const searchKeys = {
  all: ['search'] as const,
  query: (keyword: string) => ['search', keyword] as const,
}

export function useSearch(keyword: string) {
  const trimmed = keyword.trim()
  return useQuery({
    queryKey: searchKeys.query(trimmed),
    queryFn: () =>
      api.get<SearchResponse>('/search', { params: { q: trimmed } }),
    enabled: trimmed.length > 0,
    staleTime: 0,
  })
}
