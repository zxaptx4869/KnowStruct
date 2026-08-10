import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    url.includes('/api/search')
      ? Promise.resolve(jsonResponse(searchResponse()))
      : Promise.resolve(jsonResponse([])),
) {
  const fetchMock = vi.fn(handler)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function searchCallCount(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/search')).length
}

function searchCallParams(fetchMock: ReturnType<typeof vi.fn>, index = 0): URLSearchParams {
  const call = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/search'))[index]
  return new URL(String(call![0]), 'http://localhost').searchParams
}

async function typeKeyword(keyword: string) {
  const input = screen.getByLabelText('搜索关键词')
  await userEvent.type(input, keyword)
  return input
}

async function submitByButton(keyword: string) {
  await typeKeyword(keyword)
  await userEvent.click(screen.getByRole('button', { name: '搜索' }))
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
    expect(searchCallCount(fetchMock)).toBe(0)
  })

  it('does not search while typing and searches on submit', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage()

    const input = await typeKeyword('冰箱')
    expect(input).toHaveValue('冰箱')
    expect(searchCallCount(fetchMock)).toBe(0)

    await userEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(searchCallCount(fetchMock)).toBe(1)
  })

  it('submits with the Enter key', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage()

    const input = await typeKeyword('冰箱')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(searchCallCount(fetchMock)).toBe(1)
  })

  it('ignores Enter while the IME is composing', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage()

    const input = await typeKeyword('xiwanji')
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(searchCallCount(fetchMock)).toBe(0)

    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(searchCallCount(fetchMock)).toBe(1)
  })

  it('ignores Enter reported as composing by the browser', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage()

    const input = await typeKeyword('xiwanji')
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(searchCallCount(fetchMock)).toBe(0)
  })

  it('shows a hint and does not request on an empty submit', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage()

    await userEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请输入搜索关键词')
    expect(searchCallCount(fetchMock)).toBe(0)
  })

  it('renders entry and source hits after submit with highlight and URL', async () => {
    const fetchMock = searchFetchMock()
    const { container } = renderSearchPage()

    await submitByButton('冰箱')

    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(screen.getByText('避坑 · Entry')).toBeInTheDocument()
    expect(screen.getByText('新房装修 / 家具家电 / 冰箱')).toBeInTheDocument()
    expect(screen.getByText('图片 · 零嵌冰箱安装避坑截图')).toBeInTheDocument()
    expect(screen.getByText('来源命中')).toBeInTheDocument()
    expect(screen.getByText(/关联 2 条正式记录/)).toBeInTheDocument()
    const marks = Array.from(container.querySelectorAll('mark.search-highlight'))
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.map((mark) => mark.textContent)).toContain('冰箱')

    const searchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/search'))
    expect(searchCall).toBeDefined()
    expect(decodeURIComponent(String(searchCall![0]))).toContain('q=冰箱')
  })

  it('navigates from an entry result to its node', async () => {
    searchFetchMock()
    renderSearchPage()

    await submitByButton('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })

    await userEvent.click(screen.getByRole('button', { name: '回到节点：零嵌冰箱需要先确认散热方式' }))
    expect(await screen.findByTestId('node-page')).toBeInTheDocument()
  })

  it('opens the source detail page from a source hit', async () => {
    searchFetchMock()
    renderSearchPage()

    await submitByButton('冰箱')
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

    await submitByButton('不存在的关键词')
    expect(await screen.findByText('没有找到“不存在的关键词”')).toBeInTheDocument()
    expect(screen.getByLabelText('搜索关键词')).toHaveValue('不存在的关键词')

    await userEvent.click(screen.getByRole('button', { name: '清除并重新输入' }))
    expect(await screen.findByRole('heading', { name: '最近搜索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '不存在的关键词' })).toBeInTheDocument()
    expect(screen.getByLabelText('搜索关键词')).toHaveValue('')
  })

  it('keeps the keyword and retries after a search failure', async () => {
    let attempts = 0
    const fetchMock = searchFetchMock((url) => {
      if (String(url).includes('/api/search')) {
        attempts += 1
        if (attempts === 1) {
          return Promise.resolve(jsonResponse(
            { detail: { code: 'request_failed', message: '服务器错误' } },
            500,
          ))
        }
        return Promise.resolve(jsonResponse(searchResponse()))
      }
      return Promise.resolve(jsonResponse([]))
    })
    renderSearchPage()

    await submitByButton('冰箱')
    expect(await screen.findByRole('alert')).toHaveTextContent('搜索失败')
    expect(screen.getByLabelText('搜索关键词')).toHaveValue('冰箱')

    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(searchCallCount(fetchMock)).toBe(2)
  })

  it('does not record a failed search', async () => {
    searchFetchMock(() => Promise.resolve(jsonResponse(
      { detail: { code: 'request_failed', message: '服务器错误' } },
      500,
    )))
    renderSearchPage()

    await submitByButton('冰箱')
    await screen.findByRole('alert')
    await userEvent.clear(screen.getByLabelText('搜索关键词'))

    expect(await screen.findByText('输入关键词开始搜索')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '最近搜索' })).not.toBeInTheDocument()
  })

  it('restores and searches the keyword from the URL query parameter on load', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage('/search?q=冰箱')

    await waitFor(() => {
      expect(screen.getByLabelText('搜索关键词')).toHaveValue('冰箱')
    })
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(searchCallCount(fetchMock)).toBe(1)
  })

  it('keeps previous results while editing without a new request', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage()

    await submitByButton('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })

    const input = screen.getByLabelText('搜索关键词')
    await userEvent.type(input, '柜')
    expect(input).toHaveValue('冰箱柜')
    expect(screen.getByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(searchCallCount(fetchMock)).toBe(1)
  })

  it('resets to idle when the input is cleared', async () => {
    searchFetchMock()
    renderSearchPage()

    await submitByButton('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })

    await userEvent.clear(screen.getByLabelText('搜索关键词'))
    expect(await screen.findByRole('heading', { name: '最近搜索' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).not.toBeInTheDocument()
  })

  it('shows history chips after a search and re-runs a search from a chip', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage()

    await submitByButton('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.clear(screen.getByLabelText('搜索关键词'))
    await screen.findByRole('heading', { name: '最近搜索' })

    expect(screen.getByRole('button', { name: '冰箱' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '冰箱' }))
    expect(screen.getByLabelText('搜索关键词')).toHaveValue('冰箱')
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(searchCallCount(fetchMock)).toBe(2)
  })

  it('deletes a single history chip', async () => {
    searchFetchMock()
    renderSearchPage()

    await submitByButton('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.clear(screen.getByLabelText('搜索关键词'))
    await screen.findByRole('heading', { name: '最近搜索' })

    await userEvent.click(screen.getByRole('button', { name: '删除最近搜索：冰箱' }))
    expect(screen.queryByRole('button', { name: '删除最近搜索：冰箱' })).not.toBeInTheDocument()
    expect(screen.getByText('输入关键词开始搜索')).toBeInTheDocument()
  })

  it('clears all history chips back to guidance', async () => {
    searchFetchMock()
    renderSearchPage()

    await submitByButton('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.clear(screen.getByLabelText('搜索关键词'))
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

    await submitByButton('冰箱')
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(searchCallCount(fetchMock)).toBe(1)

    await userEvent.clear(screen.getByLabelText('搜索关键词'))
    expect(await screen.findByText('输入关键词开始搜索')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '最近搜索' })).not.toBeInTheDocument()
  })

  it('renders filter controls and loads node options for the selected project', async () => {
    const fetchMock = searchFetchMock((url) => {
      if (url === '/api/projects') {
        return Promise.resolve(jsonResponse([
          { id: 'project-1', name: '新房装修' },
          { id: 'project-2', name: '日本旅行' },
        ]))
      }
      if (url === '/api/projects/project-1/nodes') {
        return Promise.resolve(jsonResponse([
          { id: 'node-fridge', project_id: 'project-1', parent_id: null, name: '冰箱' },
          { id: 'node-kitchen', project_id: 'project-1', parent_id: 'node-fridge', name: '台面' },
        ]))
      }
      if (String(url).includes('/api/search')) {
        return Promise.resolve(jsonResponse(searchResponse()))
      }
      return Promise.resolve(jsonResponse([]))
    })
    renderSearchPage()

    const projectSelect = screen.getByLabelText('筛选项目')
    const typeSelect = screen.getByLabelText('筛选类型')
    const nodeSelect = screen.getByLabelText('筛选节点')
    expect(projectSelect).toBeInTheDocument()
    expect(typeSelect).toBeInTheDocument()
    expect(nodeSelect).toBeDisabled()

    expect(await screen.findByRole('option', { name: '新房装修' })).toBeInTheDocument()
    await userEvent.selectOptions(projectSelect, 'project-1')
    expect(await screen.findByRole('option', { name: '冰箱' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /台面/ })).toBeInTheDocument()
    expect(nodeSelect).toBeEnabled()
    expect(searchCallCount(fetchMock)).toBe(0)
  })

  it('sends filters with the search and persists them in the URL', async () => {
    const fetchMock = searchFetchMock((url) => {
      if (url === '/api/projects') {
        return Promise.resolve(jsonResponse([
          { id: 'project-1', name: '新房装修' },
        ]))
      }
      if (String(url).includes('/api/search')) {
        return Promise.resolve(jsonResponse(searchResponse()))
      }
      return Promise.resolve(jsonResponse([]))
    })
    renderSearchPage('/search?q=冰箱&project=project-1&type=pitfall')

    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: '新房装修' })).toBeInTheDocument()
    expect(screen.getByLabelText('筛选项目')).toHaveValue('project-1')
    expect(screen.getByLabelText('筛选类型')).toHaveValue('pitfall')
    const params = searchCallParams(fetchMock)
    expect(params.get('q')).toBe('冰箱')
    expect(params.get('project')).toBe('project-1')
    expect(params.get('type')).toBe('pitfall')
  })

  it('re-runs the search when a filter changes after results', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage()
    await submitByButton('冰箱')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })

    await userEvent.selectOptions(screen.getByLabelText('筛选类型'), 'price')

    await waitFor(() => {
      expect(searchCallCount(fetchMock)).toBe(2)
    })
    expect(searchCallParams(fetchMock, 1).get('type')).toBe('price')
    expect(searchCallParams(fetchMock, 1).get('q')).toBe('冰箱')
  })

  it('resets the node filter when the project changes', async () => {
    const fetchMock = searchFetchMock((url) => {
      if (url === '/api/projects') {
        return Promise.resolve(jsonResponse([
          { id: 'project-1', name: '新房装修' },
          { id: 'project-2', name: '日本旅行' },
        ]))
      }
      if (String(url).startsWith('/api/projects/') && String(url).endsWith('/nodes')) {
        return Promise.resolve(jsonResponse([
          { id: 'node-fridge', project_id: 'project-1', parent_id: null, name: '冰箱' },
        ]))
      }
      if (String(url).includes('/api/search')) {
        return Promise.resolve(jsonResponse(searchResponse()))
      }
      return Promise.resolve(jsonResponse([]))
    })
    renderSearchPage('/search?q=冰箱&project=project-1&node=node-fridge')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    expect(searchCallParams(fetchMock).get('node')).toBe('node-fridge')

    await userEvent.selectOptions(screen.getByLabelText('筛选项目'), 'project-2')

    await waitFor(() => {
      expect(searchCallCount(fetchMock)).toBe(2)
    })
    expect(searchCallParams(fetchMock, 1).get('project')).toBe('project-2')
    expect(searchCallParams(fetchMock, 1).get('node')).toBeNull()
    expect(screen.getByLabelText('筛选节点')).toHaveValue('')
  })

  it('offers clear filters on no results under filters', async () => {
    const fetchMock = searchFetchMock(() => Promise.resolve(jsonResponse({ entries: [], sources: [] })))
    renderSearchPage()
    await submitByButton('冰箱')
    await screen.findByText('没有找到“冰箱”')
    expect(screen.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('筛选类型'), 'price')
    expect(await screen.findByRole('button', { name: '清除筛选' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    await waitFor(() => {
      expect(searchCallCount(fetchMock)).toBe(3)
    })
    expect(searchCallParams(fetchMock, 2).get('type')).toBeNull()
    expect(screen.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument()
  })

  it('shows a readable error and clear filters for invalid URL filter params', async () => {
    const fetchMock = searchFetchMock((url) => {
      if (String(url).includes('project=bad-project')) {
        return Promise.resolve(jsonResponse(
          { detail: { code: 'invalid_project', message: '项目不存在或不属于当前工作区' } },
          422,
        ))
      }
      if (String(url).includes('/api/search')) {
        return Promise.resolve(jsonResponse(searchResponse()))
      }
      return Promise.resolve(jsonResponse([]))
    })
    renderSearchPage('/search?q=冰箱&project=bad-project')

    expect(await screen.findByText(/项目不存在或不属于当前工作区/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    await waitFor(() => {
      expect(searchCallCount(fetchMock)).toBe(2)
    })
    expect(searchCallParams(fetchMock, 1).get('project')).toBeNull()
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
  })

  it('re-runs a history keyword with the current filters', async () => {
    const fetchMock = searchFetchMock()
    renderSearchPage('/search?q=冰箱&project=project-1')
    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.clear(screen.getByLabelText('搜索关键词'))
    await screen.findByRole('heading', { name: '最近搜索' })

    await userEvent.click(screen.getByRole('button', { name: '冰箱' }))
    await waitFor(() => {
      expect(searchCallCount(fetchMock)).toBe(2)
    })
    expect(searchCallParams(fetchMock, 1).get('q')).toBe('冰箱')
    expect(searchCallParams(fetchMock, 1).get('project')).toBe('project-1')
  })
})
