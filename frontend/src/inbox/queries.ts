import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  AiConfig,
  AiConfigUpdate,
  BatchConfirmInput,
  BatchConfirmResponse,
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
    // 切换状态/类型/关键词标签时立即重新拉取，避免显示 5 分钟缓存里的旧状态
    staleTime: 0,
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
    // 详情页处理状态经常变化，禁止 5 分钟缓存，进入页面即重新拉取
    staleTime: 0,
    refetchOnMount: 'always',
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
      for (const file of input.files) {
        form.append('files', file)
      }
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

export function useBatchAssignSources() {
  const invalidate = useInvalidateInbox()
  return useMutation({
    mutationFn: ({
      sourceIds,
      projectId,
    }: {
      sourceIds: string[]
      projectId: string
    }) =>
      api.post<{ assigned: number }>('/inbox/sources/batch/assign', {
        source_ids: sourceIds,
        project_id: projectId,
      }),
    onSettled: invalidate,
  })
}

export function useAssignSource(sourceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      api.post<SourceDetail>(
        `/inbox/sources/${sourceId}/assign`,
        { project_id: projectId },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.detail(sourceId) })
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all })
    },
  })
}

export function useBatchDeleteSources() {
  const invalidate = useInvalidateInbox()
  return useMutation({
    mutationFn: (sourceIds: string[]) =>
      api.post<{ deleted: number }>('/inbox/sources/batch/delete', {
        source_ids: sourceIds,
      }),
    onSettled: invalidate,
  })
}

export function useBatchRetrySources() {
  const invalidate = useInvalidateInbox()
  return useMutation({
    mutationFn: (sourceIds: string[]) =>
      api.post<{ retried: number }>('/inbox/sources/batch/retry', {
        source_ids: sourceIds,
      }),
    onSettled: invalidate,
  })
}

export function useBatchConfirmSources() {
  const invalidate = useInvalidateInbox()
  return useMutation({
    mutationFn: ({ sourceIds, projectId, nodeId }: BatchConfirmInput) =>
      api.post<BatchConfirmResponse>('/inbox/sources/batch/confirm', {
        source_ids: sourceIds,
        project_id: projectId,
        ...(nodeId ? { node_id: nodeId } : {}),
      }),
    onSettled: invalidate,
  })
}

export function useBatchConfirmDetails(sourceIds: string[]) {
  return useQuery({
    queryKey: [
      'inbox',
      'batch-confirm-preview',
      [...sourceIds].sort().join(','),
    ] as const,
    queryFn: async () => {
      const details: SourceDetail[] = []
      for (let start = 0; start < sourceIds.length; start += 10) {
        const chunk = sourceIds.slice(start, start + 10)
        const part = await Promise.all(
          chunk.map((sourceId) =>
            api.get<SourceDetail>(`/inbox/sources/${sourceId}`),
          ),
        )
        details.push(...part)
      }
      return details
    },
    enabled: sourceIds.length > 0,
    staleTime: 0,
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
