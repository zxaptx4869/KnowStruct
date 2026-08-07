import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  ReviewFindingType,
  ReviewFindingsResponse,
  ReviewResolutionInput,
  ReviewResolutionResult,
  ReviewStatus,
  ReviewTargetType,
} from './types'

export const reviewKeys = {
  all: ['review'] as const,
  findings: (status: ReviewStatus, findingType: ReviewFindingType | 'all') =>
    ['review', 'findings', status, findingType] as const,
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
