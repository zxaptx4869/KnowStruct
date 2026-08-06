import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  Node,
  NodeDeleteResult,
  NodeEntry,
  NodeInput,
  NodeMoveInput,
  Project,
  ProjectInput,
} from './types'

export const projectKeys = {
  all: ['projects'] as const,
  detail: (projectId: string) => ['projects', projectId] as const,
  nodes: (projectId: string) => ['projects', projectId, 'nodes'] as const,
  entries: (projectId: string, nodeId: string) =>
    ['projects', projectId, 'nodes', nodeId, 'entries'] as const,
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

function useInvalidateProject(projectId?: string) {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: projectKeys.all })
    if (projectId) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectKeys.nodes(projectId) }),
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
