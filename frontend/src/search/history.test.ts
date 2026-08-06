import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SEARCH_HISTORY_LIMIT,
  addSearch,
  clearHistory,
  historyKey,
  readHistory,
  removeSearch,
} from './history'

const USER_ID = 'user-1'

describe('search history storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('records the first search and persists it', () => {
    const items = addSearch(USER_ID, '冰箱')
    expect(items).toEqual([{ keyword: '冰箱', searched_at: expect.any(String) }])
    expect(readHistory(USER_ID)).toEqual(items)
    expect(window.localStorage.getItem(historyKey(USER_ID))).toContain('冰箱')
  })

  it('keeps at most eight items and evicts the oldest', () => {
    const keywords = Array.from({ length: SEARCH_HISTORY_LIMIT + 1 }, (_, index) => `关键词${index + 1}`)
    let items: ReturnType<typeof readHistory> = []
    for (const keyword of keywords) {
      items = addSearch(USER_ID, keyword)
    }
    expect(items).toHaveLength(SEARCH_HISTORY_LIMIT)
    expect(items[0]?.keyword).toBe(`关键词${SEARCH_HISTORY_LIMIT + 1}`)
    expect(items.some((item) => item.keyword === '关键词1')).toBe(false)
  })

  it('moves a repeated keyword to the top without duplicating it', () => {
    addSearch(USER_ID, '冰箱')
    addSearch(USER_ID, '瓷砖')
    addSearch(USER_ID, '冰箱')
    const items = readHistory(USER_ID)
    expect(items.map((item) => item.keyword)).toEqual(['冰箱', '瓷砖'])
  })

  it('trims keywords and ignores blank input', () => {
    expect(addSearch(USER_ID, '  冰箱  ')[0]?.keyword).toBe('冰箱')
    expect(addSearch(USER_ID, '')).toEqual(readHistory(USER_ID))
    expect(addSearch(USER_ID, '   ')).toEqual(readHistory(USER_ID))
  })

  it('removes a single item and keeps the order of the rest', () => {
    addSearch(USER_ID, '冰箱')
    addSearch(USER_ID, '瓷砖')
    addSearch(USER_ID, '吊顶')
    const items = removeSearch(USER_ID, '瓷砖')
    expect(items.map((item) => item.keyword)).toEqual(['吊顶', '冰箱'])
    expect(readHistory(USER_ID).map((item) => item.keyword)).toEqual(['吊顶', '冰箱'])
  })

  it('clears all history', () => {
    addSearch(USER_ID, '冰箱')
    expect(clearHistory(USER_ID)).toEqual([])
    expect(readHistory(USER_ID)).toEqual([])
    expect(window.localStorage.getItem(historyKey(USER_ID))).toBeNull()
  })

  it('filters invalid entries and duplicates in stored data', () => {
    window.localStorage.setItem(
      historyKey(USER_ID),
      JSON.stringify([
        { keyword: '冰箱', searched_at: '2026-08-06T10:00:00.000Z' },
        { keyword: '冰箱', searched_at: '2026-08-06T09:00:00.000Z' },
        { keyword: '   ', searched_at: '2026-08-06T08:00:00.000Z' },
        { keyword: '瓷砖', searched_at: null },
        'garbage',
        { searched_at: '2026-08-06T07:00:00.000Z' },
        { keyword: '吊顶', searched_at: '2026-08-06T06:00:00.000Z' },
      ]),
    )
    expect(readHistory(USER_ID).map((item) => item.keyword)).toEqual(['冰箱', '吊顶'])
  })

  it('returns an empty list for malformed JSON or non-array payloads', () => {
    window.localStorage.setItem(historyKey(USER_ID), 'not-json')
    expect(readHistory(USER_ID)).toEqual([])
    window.localStorage.setItem(historyKey(USER_ID), JSON.stringify({ keyword: '冰箱' }))
    expect(readHistory(USER_ID)).toEqual([])
  })

  it('degrades gracefully when localStorage throws', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(readHistory(USER_ID)).toEqual([])
    expect(addSearch(USER_ID, '冰箱')).toEqual([])
    expect(removeSearch(USER_ID, '冰箱')).toEqual([])
    expect(clearHistory(USER_ID)).toEqual([])
  })

  it('isolates history by user', () => {
    addSearch('user-1', '冰箱')
    addSearch('user-2', '瓷砖')
    expect(readHistory('user-1').map((item) => item.keyword)).toEqual(['冰箱'])
    expect(readHistory('user-2').map((item) => item.keyword)).toEqual(['瓷砖'])
  })
})
