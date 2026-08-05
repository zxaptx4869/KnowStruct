import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  AiConfig,
  AiConfigUpdate,
  DecideInput,
  DecideResponse,
  ImageSourceCreateInput,
  SourceCreateInput,
  SourceDetail,
  SourceItem,
  SourceListParams,
} from './types'

export const inboxKeys = {
  all: ['inbox'] as const,
  list: (params: SourceListParams) => ['inbox', 'sources', params] as const,
  detail: (sourceId: string) => ['inbox', 'sources', sourceId] as const,
}

const POLL_WHILE_PROCESSING = 3000

export function useInboxSources(params: SourceListParams = {}) {
  return useQuery({
    queryKey: inboxKeys.list(params),
    queryFn: () =>
      api.get<SourceItem[]>('/inbox/sources', {
        params: {
          state: params.state,
          source_type: params.source_type,
          project_id: params.project_id,
          q: params.q,
        },
      }),
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.processing_state === 'processing')
        ? POLL_WHILE_PROCESSING
        : false,
  })
}

export function useSourceDetail(sourceId: string) {
  return useQuery({
    queryKey: inboxKeys.detail(sourceId),
    queryFn: () => api.get<SourceDetail>(`/inbox/sources/${sourceId}`),
    enabled: Boolean(sourceId),
    refetchInterval: (query) =>
      query.state.data?.processing_state === 'processing'
        ? POLL_WHILE_PROCESSING
        : false,
  })
}

function useInvalidateInbox() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: inboxKeys.all })
  }
}

export function useCreateSource() {
  const invalidate = useInvalidateInbox()
  return useMutation({
    mutationFn: (input: SourceCreateInput) =>
      api.post<SourceDetail>('/inbox/sources', input),
    onSuccess: invalidate,
  })
}

export function useCreateImageSource() {
  const invalidate = useInvalidateInbox()
  return useMutation({
    mutationFn: (input: ImageSourceCreateInput) => {
      const form = new FormData()
      form.append('file', input.file)
      if (input.project_id) form.append('project_id', input.project_id)
      if (input.note) form.append('note', input.note)
      return api.post<SourceDetail>('/inbox/sources/image', form)
    },
    onSuccess: invalidate,
  })
}

export function useRetrySource(sourceId: string) {
  const invalidate = useInvalidateInbox()
  return useMutation({
    mutationFn: () => api.post<SourceDetail>(`/inbox/sources/${sourceId}/retry`),
    onSettled: invalidate,
  })
}

export function useDecideExtraction(sourceId: string) {
  const invalidate = useInvalidateInbox()
  return useMutation({
    mutationFn: ({
      extractionId,
      input,
    }: {
      extractionId: string
      input: DecideInput
    }) =>
      api.post<DecideResponse>(
        `/inbox/sources/${sourceId}/extractions/${extractionId}/decide`,
        input,
      ),
    onSettled: invalidate,
  })
}

export function useAiConfig() {
  return useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api.get<AiConfig>('/ai-config'),
  })
}

export function useSaveAiConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AiConfigUpdate) => api.put<AiConfig>('/ai-config', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-config'] }),
  })
}

export function useDeleteAiConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<void>('/ai-config'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-config'] }),
  })
}
