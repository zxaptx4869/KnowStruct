import type { ReviewScopeSelection } from './types'

const STORAGE_PREFIX = 'knowstruct.review.scope.'

export function scopeKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

export const DEFAULT_SCOPE: ReviewScopeSelection = {
  project_id: null,
  node_id: null,
}

export function readScope(userId: string): ReviewScopeSelection {
  if (!userId) return DEFAULT_SCOPE
  try {
    const raw = window.localStorage.getItem(scopeKey(userId))
    if (!raw) return DEFAULT_SCOPE
    const parsed = JSON.parse(raw) as Partial<ReviewScopeSelection> & {
      scope_type?: 'workspace' | 'project' | 'node'
    }
    if (parsed.scope_type === 'workspace') {
      return { project_id: null, node_id: null }
    }
    if (parsed.scope_type === 'node') {
      return {
        project_id:
          typeof parsed.project_id === 'string' ? parsed.project_id : null,
        node_id: typeof parsed.node_id === 'string' ? parsed.node_id : null,
      }
    }
    if (parsed.scope_type === 'project') {
      return {
        project_id:
          typeof parsed.project_id === 'string' ? parsed.project_id : null,
        node_id: null,
      }
    }
    return {
      project_id:
        typeof parsed.project_id === 'string' ? parsed.project_id : null,
      node_id: typeof parsed.node_id === 'string' ? parsed.node_id : null,
    }
  } catch {
    return DEFAULT_SCOPE
  }
}

export function writeScope(
  userId: string,
  scope: ReviewScopeSelection,
): void {
  if (!userId) return
  try {
    window.localStorage.setItem(scopeKey(userId), JSON.stringify(scope))
  } catch {
    // 存储不可用时静默降级，不影响扫描
  }
}
