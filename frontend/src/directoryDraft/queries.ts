import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  DirectoryDraft,
  DraftConfirmResult,
  DraftEnvelope,
  DraftNode,
} from './types'

export const draftKeys = {
  all: ['directoryDraft'] as const,
  project: (projectId: string) => ['directoryDraft', projectId] as const,
  node: (projectId: string, nodeId: string) =>
    ['directoryDraft', projectId, 'nodes', nodeId] as const,
}

export function useDirectoryDraft(projectId: string) {
  return useQuery({
    queryKey: draftKeys.project(projectId),
    queryFn: () =>
      api.get<DraftEnvelope>(`/projects/${projectId}/drafts`),
    enabled: Boolean(projectId),
    refetchInterval: (query) =>
      query.state.data?.draft?.status === 'drafting' ? 2000 : false,
    staleTime: 0,
  })
}

function useInvalidateDraft(projectId: string) {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: draftKeys.project(projectId) })
    await queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
  }
}

export function useCreateDraft(projectId: string) {
  const invalidate = useInvalidateDraft(projectId)
  return useMutation({
    mutationFn: (background?: string) =>
      api.post<DirectoryDraft>(`/projects/${projectId}/drafts`, {
        ...(background ? { background } : {}),
      }),
    onSuccess: invalidate,
  })
}

export function useSubmitClarify(projectId: string, draftId: string) {
  const invalidate = useInvalidateDraft(projectId)
  return useMutation({
    mutationFn: (answers: Record<string, string>) =>
      api.post<DirectoryDraft>(
        `/projects/${projectId}/drafts/${draftId}/clarify`,
        { answers },
      ),
    onSuccess: invalidate,
  })
}

export function useSubmitRefine(projectId: string, draftId: string) {
  const invalidate = useInvalidateDraft(projectId)
  return useMutation({
    mutationFn: (instruction: string) =>
      api.post<DirectoryDraft>(
        `/projects/${projectId}/drafts/${draftId}/refine`,
        { instruction },
      ),
    onSuccess: invalidate,
  })
}

export function useConfirmDraft(projectId: string, draftId: string) {
  const invalidate = useInvalidateDraft(projectId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<DraftConfirmResult>(
        `/projects/${projectId}/drafts/${draftId}/confirm`,
      ),
    onSuccess: async () => {
      await invalidate()
      await queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'nodes'] })
    },
  })
}

export function useDiscardDraft(projectId: string, draftId: string) {
  const invalidate = useInvalidateDraft(projectId)
  return useMutation({
    mutationFn: () =>
      api.post<DirectoryDraft>(
        `/projects/${projectId}/drafts/${draftId}/discard`,
      ),
    onSuccess: invalidate,
  })
}

export function useRetryDraft(projectId: string, draftId: string) {
  const invalidate = useInvalidateDraft(projectId)
  return useMutation({
    mutationFn: () =>
      api.post<DirectoryDraft>(
        `/projects/${projectId}/drafts/${draftId}/retry`,
      ),
    onSuccess: invalidate,
  })
}

export function useRedraftDraft(projectId: string, draftId: string) {
  const invalidate = useInvalidateDraft(projectId)
  return useMutation({
    mutationFn: (background?: string) =>
      api.post<DirectoryDraft>(
        `/projects/${projectId}/drafts/${draftId}/redraft`,
        { ...(background ? { background } : {}) },
      ),
    onSuccess: invalidate,
  })
}

export function useEditDraftNode(projectId: string, draftId: string) {
  const invalidate = useInvalidateDraft(projectId)
  return useMutation({
    mutationFn: (input: { nodeId: string, name?: string, selected?: boolean }) =>
      api.patch<DraftNode>(
        `/projects/${projectId}/drafts/${draftId}/nodes/${input.nodeId}`,
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.selected !== undefined ? { selected: input.selected } : {}),
        },
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteDraftNode(projectId: string, draftId: string) {
  const invalidate = useInvalidateDraft(projectId)
  return useMutation({
    mutationFn: (nodeId: string) =>
      api.delete<DirectoryDraft>(
        `/projects/${projectId}/drafts/${draftId}/nodes/${nodeId}`,
      ),
    onSuccess: invalidate,
  })
}
