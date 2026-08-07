import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  ReviewCandidatesResponse,
  ReviewFindingType,
  ReviewFindingsResponse,
  ReviewResolutionInput,
  ReviewResolutionResult,
  ReviewScan,
  ReviewScopeSelection,
  ReviewStatus,
  ReviewTargetType,
} from './types'

export const reviewKeys = {
  all: ['review'] as const,
  findings: (status: ReviewStatus, findingType: ReviewFindingType | 'all') =>
    ['review', 'findings', status, findingType] as const,
  scans: ['review', 'scans'] as const,
  scan: (scanId: string) => ['review', 'scans', scanId] as const,
  candidates: (scanId: string) =>
    ['review', 'scans', scanId, 'candidates'] as const,
}

export function useReviewFindings(
  status: ReviewStatus,
  findingType: ReviewFindingType | 'all',
) {
  return useQuery({
    queryKey: reviewKeys.findings(status, findingType),
    queryFn: () =>
      api.get<ReviewFindingsResponse>('/review/findings', {
        params: {
          status,
          type: findingType === 'all' ? undefined : findingType,
        },
      }),
  })
}

export interface ReviewResolutionTarget {
  findingType: ReviewFindingType
  targetType: ReviewTargetType
  targetId: string
}

export function useReviewMutations() {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: reviewKeys.all })
  }

  const setResolution = useMutation({
    mutationFn: ({
      target,
      input,
    }: {
      target: ReviewResolutionTarget
      input: ReviewResolutionInput
    }) =>
      api.post<ReviewResolutionResult>(
        `/review/findings/${target.findingType}/${target.targetType}/${target.targetId}/resolution`,
        input,
      ),
    onSuccess: invalidate,
  })

  const undoResolution = useMutation({
    mutationFn: (target: ReviewResolutionTarget) =>
      api.delete<ReviewResolutionResult>(
        `/review/findings/${target.findingType}/${target.targetType}/${target.targetId}/resolution`,
      ),
    onSuccess: invalidate,
  })

  return { setResolution, undoResolution }
}

export function useStartScan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scope: ReviewScopeSelection) =>
      api.post<ReviewScan>('/review/scans', {
        scope_type: scope.scope_type,
        project_id: scope.project_id ?? undefined,
        node_id: scope.node_id ?? undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.scans })
    },
  })
}

export function useReviewScan(scanId: string | null) {
  return useQuery({
    queryKey: reviewKeys.scan(scanId ?? 'none'),
    queryFn: () => api.get<ReviewScan>(`/review/scans/${scanId}`),
    enabled: Boolean(scanId),
    refetchInterval: (query) => {
      const scanStatus = query.state.data?.status
      return scanStatus === 'pending' || scanStatus === 'running' ? 2000 : false
    },
  })
}

export function useScanCandidates(scanId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: reviewKeys.candidates(scanId ?? 'none'),
    queryFn: () =>
      api.get<ReviewCandidatesResponse>(`/review/scans/${scanId}/candidates`),
    enabled: Boolean(scanId) && enabled,
  })
}

export function useAiDecision() {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: reviewKeys.all })
  }
  return useMutation({
    mutationFn: ({
      findingId,
      decision,
    }: {
      findingId: string
      decision: 'confirmed' | 'rejected'
    }) =>
      api.post<{ status: string }>(
        `/review/findings/ai/${findingId}/decision`,
        { decision },
      ),
    onSuccess: invalidate,
  })
}
