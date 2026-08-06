export const SEARCH_HISTORY_LIMIT = 8

export interface SearchHistoryItem {
  keyword: string
  searched_at: string
}

const STORAGE_PREFIX = 'knowstruct.search.history.'

export function historyKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

function parseStored(raw: string | null): SearchHistoryItem[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const seen = new Set<string>()
  const items: SearchHistoryItem[] = []
  for (const entry of parsed) {
    if (items.length >= SEARCH_HISTORY_LIMIT) break
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as SearchHistoryItem).keyword !== 'string' ||
      (entry as SearchHistoryItem).keyword.trim().length === 0 ||
      typeof (entry as SearchHistoryItem).searched_at !== 'string'
    ) {
      continue
    }
    const keyword = (entry as SearchHistoryItem).keyword
    if (seen.has(keyword)) continue
    seen.add(keyword)
    items.push({ keyword, searched_at: (entry as SearchHistoryItem).searched_at })
  }
  return items
}

export function readHistory(userId: string): SearchHistoryItem[] {
  try {
    return parseStored(window.localStorage.getItem(historyKey(userId)))
  } catch {
    return []
  }
}

function persist(userId: string, items: SearchHistoryItem[]): boolean {
  try {
    window.localStorage.setItem(historyKey(userId), JSON.stringify(items))
    return true
  } catch {
    // 存储不可用时静默降级：历史仅在内存中生效，不影响搜索
    return false
  }
}

export function addSearch(userId: string, keyword: string): SearchHistoryItem[] {
  const trimmed = keyword.trim()
  if (!trimmed) return readHistory(userId)
  const current = readHistory(userId)
  const next = [
    { keyword: trimmed, searched_at: new Date().toISOString() },
    ...current.filter((item) => item.keyword !== trimmed),
  ].slice(0, SEARCH_HISTORY_LIMIT)
  return persist(userId, next) ? next : current
}

export function removeSearch(userId: string, keyword: string): SearchHistoryItem[] {
  const trimmed = keyword.trim()
  const next = readHistory(userId).filter((item) => item.keyword !== trimmed)
  persist(userId, next)
  return next
}

export function clearHistory(userId: string): SearchHistoryItem[] {
  try {
    window.localStorage.removeItem(historyKey(userId))
  } catch {
    // 静默降级
  }
  return []
}
