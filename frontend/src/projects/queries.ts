import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  BatchEntryMoveInput,
  EntryUpdateInput,
  Node,
  NodeDeleteResult,
  NodeEntry,
  NodeInput,
  NodeMoveInput,
  Project,
  ProjectInput,
  ProjectRecords,
} from './types'

export const projectKeys = {
  all: ['projects'] as const,
  detail: (projectId: string) => ['projects', projectId] as const,
  nodes: (projectId: string) => ['projects', projectId, 'nodes'] as const,
  entries: (projectId: string, nodeId: string) =>
    ['projects', projectId, 'nodes', nodeId, 'entries'] as const,
  projectEntries: (projectId: string) =>
    ['projects', projectId, 'entries'] as const,
}

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => api.get<Project[]>('/projects'),
  })
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => api.get<Project>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  })
}

export function useNodes(projectId: string) {
  return useQuery({
    queryKey: projectKeys.nodes(projectId),
    queryFn: () => api.get<Node[]>(`/projects/${projectId}/nodes`),
    enabled: Boolean(projectId),
  })
}

export function useNodeEntries(projectId: string, nodeId: string) {
  return useQuery({
    queryKey: projectKeys.entries(projectId, nodeId),
    queryFn: () =>
      api.get<NodeEntry[]>(`/projects/${projectId}/nodes/${nodeId}/entries`),
    enabled: Boolean(projectId && nodeId),
  })
}

export function useProjectEntries(projectId: string) {
  return useQuery({
    queryKey: projectKeys.projectEntries(projectId),
    queryFn: () => api.get<ProjectRecords>(`/projects/${projectId}/entries`),
    enabled: Boolean(projectId),
  })
}

function useInvalidateProject(projectId?: string) {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: projectKeys.all })
    if (projectId) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectKeys.nodes(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectKeys.projectEntries(projectId) }),
      ])
    }
  }
}

export function useCreateProject() {
  const invalidate = useInvalidateProject()
  return useMutation({
    mutationFn: (input: ProjectInput) => api.post<Project>('/projects', input),
    onSuccess: invalidate,
  })
}

export function useUpdateProject(projectId: string) {
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (input: Partial<ProjectInput>) =>
      api.patch<Project>(`/projects/${projectId}`, input),
    onSuccess: invalidate,
  })
}

export function useDeleteProject(projectId: string) {
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: () => api.delete<void>(`/projects/${projectId}`),
    onSuccess: invalidate,
  })
}

export function useCreateNode(projectId: string) {
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (input: NodeInput) =>
      api.post<Node>(`/projects/${projectId}/nodes`, input),
    onSuccess: invalidate,
  })
}

export function useUpdateNode(projectId: string, nodeId: string) {
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (input: Partial<NodeInput>) =>
      api.patch<Node>(`/projects/${projectId}/nodes/${nodeId}`, input),
    onSuccess: invalidate,
  })
}

export function useMoveNode(projectId: string) {
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: ({ nodeId, input }: { nodeId: string, input: NodeMoveInput }) =>
      api.post<Node>(`/projects/${projectId}/nodes/${nodeId}/move`, input),
    onSettled: invalidate,
  })
}

export function useDeleteNode(projectId: string) {
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (nodeId: string) =>
      api.delete<NodeDeleteResult>(`/projects/${projectId}/nodes/${nodeId}`),
    onSuccess: invalidate,
  })
}

export function useUpdateEntry(projectId: string, entryId: string) {
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (input: EntryUpdateInput) =>
      api.patch<NodeEntry>(`/projects/${projectId}/entries/${entryId}`, input),
    onSettled: invalidate,
  })
}

export function useDeleteEntry(projectId: string) {
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (entryId: string) =>
      api.delete<void>(`/projects/${projectId}/entries/${entryId}`),
    onSuccess: invalidate,
  })
}

export function useBatchMoveEntries(projectId: string) {
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (input: BatchEntryMoveInput) =>
      api.post<{ moved: number }>(
        `/projects/${projectId}/entries/batch/move`,
        input,
      ),
    onSettled: invalidate,
  })
}

export function useBatchDeleteEntries(projectId: string) {
  const invalidate = useInvalidateProject(projectId)
  return useMutation({
    mutationFn: (entryIds: string[]) =>
      api.post<{ deleted: number }>(
        `/projects/${projectId}/entries/batch/delete`,
        { entry_ids: entryIds },
      ),
    onSettled: invalidate,
  })
}
