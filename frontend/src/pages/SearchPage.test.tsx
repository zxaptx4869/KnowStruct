import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from '../components/Toast'
import { jsonResponse } from '../projects/testUtils'
import type { SearchEntryHit, SearchResponse, SearchSourceHit } from '../search/types'
import SearchPage from './SearchPage'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: { id: 'user-1', login_name: 'owner' },
    workspace: { id: 'workspace-1', name: '我的工作区' },
    login: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
  }),
}))

const entryHit: SearchEntryHit = {
  id: 'entry-1',
  entry_type: 'pitfall',
  title: '零嵌冰箱需要先确认散热方式',
  content: '底部散热和两侧散热的预留要求不同。',
  project_id: 'project-1',
  project_name: '新房装修',
  node_id: 'node-fridge',
  node_path: ['家具家电', '冰箱'],
  sources: [
    { id: 'source-1', source_type: 'image', title: '零嵌冰箱安装避坑截图' },
    { id: 'source-2', source_type: 'link', title: '品牌官网商品页' },
  ],
  created_at: '2026-08-05T10:00:00',
}

const sourceHit: SearchSourceHit = {
  id: 'source-3',
  source_type: 'link',
  title: '候选型号 A 品牌官网商品页',
  content: '冰箱 底部散热 安装尺寸',
  link_url: 'https://example.com/a',
  project_id: 'project-1',
  project_name: '新房装修',
  entry_count: 2,
  created_at: '2026-08-05T09:00:00',
}

function searchResponse(): SearchResponse {
  return { entries: [entryHit], sources: [sourceHit] }
}

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{location.pathname}</span>
}

function renderSearchPage(initialEntry = '/search') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ToastProvider>
          <Routes>
            <Route path="/search" element={<><SearchPage /><LocationProbe /></>} />
            <Route path="/inbox/:sourceId" element={<div data-testid="source-page">来源详情页</div>} />
            <Route path="/projects/:id/nodes/:nid" element={<div data-testid="node-page">节点详情页</div>} />
            <Route path="/projects/:id" element={<div data-testid="project-page">项目页</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function searchFetchMock(
  handler: (url: string) => Promise<Response> = (url) =>
    url.includes('/api/search') ? Promise.resolve(jsonResponse(searchResponse())) : Promise.resolve(jsonResponse({})),
) {
  const fetchMock = vi.fn(handler)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function typeKeyword(keyword: string) {
  const input = screen.getByLabelText('搜索关键词')
  await userEvent.type(input, keyword)
  return input
}

describe('SearchPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows guidance and does not request when the keyword is empty', () => {
    const fetchMock = searchFetchMock()
    renderSearchPage()

    expect(screen.getByText('输入关键词开始搜索')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search'))).toBe(false)
  })

  it('searches after debounce and renders entry and source hits', async () => {
    const fetchMock = searchFetchMock()
    const { container } = renderSearchPage()

    await typeKeyword('冰箱')

    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(screen.getByText('避坑 · Entry')).toBeInTheDocument()
    expect(screen.getByText('新房装修 / 家具家电 / 冰箱')).toBeInTheDocument()
    expect(screen.getByText('图片 · 零嵌冰箱安装避坑截图')).toBeInTheDocument()
    expect(screen.getByText('链接 · 品牌官网商品页')).toBeInTheDocument()
    expect(screen.getByText('来源命中')).toBeInTheDocument()
    expect(screen.getByText('候选型号 A 品牌官网商品页')).toBeInTheDocument()
    expect(screen.getByText(/关联 2 条正式记录/)).toBeInTheDocument()
    const marks = Array.from(container.querySelectorAll('mark.search-highlight'))
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.map((mark) => mark.textContent)).toContain('冰箱')

    const searchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/search'))
    expect(searchCall).toBeDefined()
    expect(decodeURIComponent(String(searchCall![0]))).toContain('q=冰箱')
  })

  it('navigates from an entry result to its node and from a source chip to the source', async () => {
    searchFetchMock()
    renderSearchPage()

    await typeKeyword('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })

    await userEvent.click(screen.getByRole('button', { name: '回到节点：零嵌冰箱需要先确认散热方式' }))
    expect(await screen.findByTestId('node-page')).toBeInTheDocument()
  })

  it('opens the source detail page from a source chip', async () => {
    searchFetchMock()
    renderSearchPage()

    await typeKeyword('冰箱')
    await screen.findByText('候选型号 A 品牌官网商品页')

    await userEvent.click(screen.getByRole('button', { name: /打开来源：候选型号 A/ }))
    expect(await screen.findByTestId('source-page')).toBeInTheDocument()
  })

  it('keeps the keyword and clears it from the no-results state', async () => {
    searchFetchMock((url) =>
      url.includes('/api/search')
        ? Promise.resolve(jsonResponse({ entries: [], sources: [] }))
        : Promise.resolve(jsonResponse({})),
    )
    renderSearchPage()

    const input = await typeKeyword('不存在的关键词')
    expect(await screen.findByText('没有找到“不存在的关键词”')).toBeInTheDocument()
    expect(input).toHaveValue('不存在的关键词')

    await userEvent.click(screen.getByRole('button', { name: '清除并重新输入' }))
    expect(await screen.findByRole('heading', { name: '最近搜索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '不存在的关键词' })).toBeInTheDocument()
    expect(screen.getByLabelText('搜索关键词')).toHaveValue('')
  })

  it('keeps the keyword and retries after a search failure', async () => {
    let attempts = 0
    const fetchMock = searchFetchMock(() => {
      attempts += 1
      if (attempts === 1) {
        return Promise.resolve(jsonResponse(
          { detail: { code: 'request_failed', message: '服务器错误' } },
          500,
        ))
      }
      return Promise.resolve(jsonResponse(searchResponse()))
    })
    renderSearchPage()

    const input = await typeKeyword('冰箱')
    expect(await screen.findByRole('alert')).toHaveTextContent('搜索失败')
    expect(input).toHaveValue('冰箱')

    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/search')).length).toBe(2)
  })

  it('restores the keyword from the URL query parameter on load', async () => {
    searchFetchMock()
    renderSearchPage('/search?q=冰箱')

    await waitFor(() => {
      expect(screen.getByLabelText('搜索关键词')).toHaveValue('冰箱')
    })
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
  })

  it('shows recent history after a successful search and clearing the keyword', async () => {
    searchFetchMock()
    renderSearchPage()

    const input = await typeKeyword('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })

    await userEvent.clear(input)
    expect(await screen.findByRole('heading', { name: '最近搜索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '冰箱' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空' })).toBeInTheDocument()
  })

  it('records a search with no results and shows it in history', async () => {
    searchFetchMock((url) =>
      url.includes('/api/search')
        ? Promise.resolve(jsonResponse({ entries: [], sources: [] }))
        : Promise.resolve(jsonResponse({})),
    )
    renderSearchPage()

    const input = await typeKeyword('不存在的关键词')
    await screen.findByText('没有找到“不存在的关键词”')

    await userEvent.clear(input)
    expect(await screen.findByRole('heading', { name: '最近搜索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '不存在的关键词' })).toBeInTheDocument()
  })

  it('does not record a failed search', async () => {
    searchFetchMock(() => Promise.resolve(jsonResponse(
      { detail: { code: 'request_failed', message: '服务器错误' } },
      500,
    )))
    renderSearchPage()

    const input = await typeKeyword('冰箱')
    await screen.findByRole('alert')

    await userEvent.clear(input)
    expect(await screen.findByText('输入关键词开始搜索')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '最近搜索' })).not.toBeInTheDocument()
  })

  it('re-runs a search when a history item is clicked', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage()

    const input = await typeKeyword('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.clear(input)
    await screen.findByRole('heading', { name: '最近搜索' })

    await userEvent.click(screen.getByRole('button', { name: '冰箱' }))
    expect(screen.getByLabelText('搜索关键词')).toHaveValue('冰箱')
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/search')).length).toBe(2)
  })

  it('deletes a single history item and keeps the guidance state', async () => {
    searchFetchMock()
    renderSearchPage()

    const input = await typeKeyword('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.clear(input)
    await screen.findByRole('heading', { name: '最近搜索' })

    await userEvent.click(screen.getByRole('button', { name: '删除最近搜索：冰箱' }))
    expect(screen.queryByRole('button', { name: '删除最近搜索：冰箱' })).not.toBeInTheDocument()
    expect(screen.getByText('输入关键词开始搜索')).toBeInTheDocument()
  })

  it('clears all history back to guidance', async () => {
    searchFetchMock()
    renderSearchPage()

    const input = await typeKeyword('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.clear(input)
    await screen.findByRole('heading', { name: '最近搜索' })

    await userEvent.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByText('输入关键词开始搜索')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '最近搜索' })).not.toBeInTheDocument()
  })

  it('keeps searching when localStorage is unavailable', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    const fetchMock = searchFetchMock()
    renderSearchPage()

    const input = await typeKeyword('冰箱')
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search'))).toBe(true)

    await userEvent.clear(input)
    expect(await screen.findByText('输入关键词开始搜索')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '最近搜索' })).not.toBeInTheDocument()
  })
})
