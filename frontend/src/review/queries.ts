import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  ReviewFindingType,
  ReviewFindingsResponse,
  ReviewResolutionInput,
  ReviewResolutionResult,
  ReviewScan,
  ReviewScanListResponse,
  ReviewScopeSelection,
  ReviewStatus,
  ReviewTargetType,
} from './types'

export const reviewKeys = {
  all: ['review'] as const,
  findingsBase: ['review', 'findings'] as const,
  findings: (status: ReviewStatus, findingType: ReviewFindingType | 'all') =>
    ['review', 'findings', status, findingType] as const,
  scans: ['review', 'scans'] as const,
  scan: (scanId: string) => ['review', 'scans', scanId] as const,
  scanFindings: (scanId: string) =>
    ['review', 'scans', scanId, 'findings'] as const,
  candidates: (scanId: string) =>
    ['review', 'scans', scanId, 'candidates'] as const,
}

export function useReviewFindings(
  status: ReviewStatus,
  findingType: ReviewFindingType | 'all',
  enabled = true,
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
    enabled,
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
        scope_type: scope.node_id ? 'node' : 'project',
        project_id: scope.project_id ?? undefined,
        node_id: scope.node_id ?? undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.scans })
    },
  })
}

export function useRecentScans() {
  return useQuery({
    queryKey: reviewKeys.scans,
    queryFn: () => api.get<ReviewScanListResponse>('/review/scans'),
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

export function useScanHistory(offset: number, limit = 20) {
  return useQuery({
    queryKey: ['review', 'scans', 'history', offset, limit],
    queryFn: () =>
      api.get<ReviewScanListResponse>('/review/scans', {
        params: { limit, offset },
      }),
  })
}

export function useScanFindings(scanId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: reviewKeys.scanFindings(scanId ?? 'none'),
    queryFn: () =>
      api.get<ReviewFindingsResponse>(`/review/scans/${scanId}/findings`),
    enabled: Boolean(scanId) && enabled,
  })
}
