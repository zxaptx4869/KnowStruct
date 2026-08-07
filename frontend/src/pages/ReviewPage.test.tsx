import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../components/Toast'
import { jsonResponse } from '../projects/testUtils'
import type {
  ReviewFinding,
  ReviewFindingsResponse,
} from '../review/types'
import ReviewPage from './ReviewPage'

const missingConditions: ReviewFinding = {
  finding_type: 'missing_conditions',
  target_type: 'entry',
  target_id: 'entry-1',
  title: '零嵌冰箱需要先确认散热方式',
  summary: '该记录没有适用条件，使用结论时可能误用范围',
  created_at: '2026-08-06T10:00:00',
  entry_type: 'pitfall',
  content: '底部散热和两侧散热的预留要求不同。',
  conditions: [],
  project_id: 'project-1',
  project_name: '新房装修',
  node_id: 'node-fridge',
  node_path: ['家具家电', '冰箱'],
}

const longPending: ReviewFinding = {
  finding_type: 'long_pending',
  target_type: 'source',
  target_id: 'source-1',
  title: '吊顶材料待确认',
  summary: '有 2 条候选待确认超过 7 天',
  created_at: '2026-07-30T10:00:00',
  source_type: 'text',
  content: '吊顶材料对比与报价',
  pending_count: 2,
  project_id: 'project-1',
  project_name: '新房装修',
}

function findingKey(item: ReviewFinding): string {
  return `${item.finding_type}:${item.target_type}:${item.target_id}`
}

function reviewFetchMock(openFindings: ReviewFinding[]) {
  const handled = new Set<string>()
  const notes = new Map<string, string>()
  const resolutions = new Map<string, 'resolved' | 'ignored'>()
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const target = String(url)
    if (target.includes('/api/review/findings') && !target.includes('/resolution')) {
      const status = target.includes('status=resolved') ? 'resolved' : 'open'
      let items = status === 'open'
        ? openFindings.filter((item) => !handled.has(findingKey(item)))
        : openFindings
            .filter((item) => handled.has(findingKey(item)))
            .map((item) => ({
              ...item,
              resolution: resolutions.get(findingKey(item)) ?? 'resolved',
              note: notes.get(findingKey(item)) ?? '',
              resolved_at: '2026-08-07T10:00:00',
            }))
      const typeMatch = target.match(/[?&]type=([^&]+)/)
      const type = typeMatch ? decodeURIComponent(typeMatch[1]) : null
      if (type) {
        items = items.filter((item) => item.finding_type === type)
      }
      return Promise.resolve(jsonResponse({ findings: items } satisfies ReviewFindingsResponse))
    }
    if (target.includes('/resolution')) {
      const key = target
        .split('/api/review/findings/')[1]
        .replace('/resolution', '')
        .replaceAll('/', ':')
      if (init?.method === 'DELETE') {
        handled.delete(key)
        notes.delete(key)
        resolutions.delete(key)
        return Promise.resolve(jsonResponse({ removed: true }))
      }
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      handled.add(key)
      notes.set(key, body.note ?? '')
      resolutions.set(key, body.resolution)
      return Promise.resolve(jsonResponse({ removed: false }))
    }
    return Promise.resolve(jsonResponse({}))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderReviewPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/review']}>
        <ToastProvider>
          <Routes>
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/inbox/:sourceId" element={<div data-testid="source-page">来源确认页</div>} />
            <Route path="/projects/:id/nodes/:nid" element={<div data-testid="node-page">节点详情页</div>} />
            <Route path="/projects/:id" element={<div data-testid="project-page">项目页</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ReviewPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('lists open findings and filters by type', async () => {
    const fetchMock = reviewFetchMock([missingConditions, longPending])
    renderReviewPage()

    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(screen.getByText('吊顶材料待确认')).toBeInTheDocument()
    expect(screen.getAllByText('缺适用条件').length).toBeGreaterThan(0)
    expect(screen.getAllByText('长期待确认').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: '长期待确认' }))
    expect(await screen.findByText('吊顶材料待确认')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).not.toBeInTheDocument()
    const filterCall = fetchMock.mock.calls.find(([url]) => String(url).includes('type=long_pending'))
    expect(filterCall).toBeDefined()
  })

  it('expands an entry finding and jumps to its node', async () => {
    reviewFetchMock([missingConditions])
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.click(screen.getByRole('button', { name: '查看详情' }))

    expect(screen.getByText('底部散热和两侧散热的预留要求不同。')).toBeInTheDocument()
    expect(screen.getByText('（无）')).toBeInTheDocument()
    expect(screen.getByText('新房装修 / 家具家电 / 冰箱')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '查看记录' }))
    expect(await screen.findByTestId('node-page')).toBeInTheDocument()
  })

  it('expands a long-pending finding and jumps to the confirm page', async () => {
    reviewFetchMock([longPending])
    renderReviewPage()

    await screen.findByText('吊顶材料待确认')
    const card = screen.getByText('吊顶材料待确认').closest('article') as HTMLElement
    await userEvent.click(within(card).getByRole('button', { name: '查看详情' }))

    expect(within(card).getByText('吊顶材料对比与报价')).toBeInTheDocument()
    expect(within(card).getByText('2 条')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: '去确认' }))
    expect(await screen.findByTestId('source-page')).toBeInTheDocument()
  })

  it('resolves a finding with a note, then undoes it', async () => {
    reviewFetchMock([missingConditions])
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.click(screen.getByRole('button', { name: '查看详情' }))
    await userEvent.type(
      screen.getByLabelText('备注：零嵌冰箱需要先确认散热方式'),
      '已补充适用条件',
    )
    await userEvent.click(screen.getByRole('button', { name: '标记已解决' }))

    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '已处理' }))
    expect(await screen.findByText('已解决：已补充适用条件')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(await screen.findByText('还没有处理记录')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '待处理' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
  })

  it('ignores a finding', async () => {
    reviewFetchMock([missingConditions])
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.click(screen.getByRole('button', { name: '忽略' }))
    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '已处理' }))
    expect(await screen.findByText('已忽略')).toBeInTheDocument()
  })

  it('shows the empty state when there are no findings', async () => {
    reviewFetchMock([])
    renderReviewPage()

    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()
  })

  it('keeps state and retries after a load failure', async () => {
    let attempts = 0
    const fetchMock = vi.fn(() => {
      attempts += 1
      if (attempts === 1) {
        return Promise.resolve(jsonResponse(
          { detail: { code: 'request_failed', message: '服务器错误' } },
          500,
        ))
      }
      return Promise.resolve(jsonResponse({ findings: [missingConditions] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderReviewPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('加载失败')
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(2)
  })

  it('shows the handled tab empty state', async () => {
    reviewFetchMock([])
    renderReviewPage()

    await userEvent.click(screen.getByRole('tab', { name: '已处理' }))
    expect(await screen.findByText('还没有处理记录')).toBeInTheDocument()
  })
})
