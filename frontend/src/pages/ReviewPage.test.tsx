import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../components/Toast'
import { jsonResponse } from '../projects/testUtils'
import { scopeKey } from '../review/scope'
import type {
  ReviewFinding,
  ReviewFindingsResponse,
  ReviewScan,
  ReviewScanListResponse,
} from '../review/types'
import ReviewPage from './ReviewPage'

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

const aiFinding: ReviewFinding = {
  finding_type: 'duplicate',
  target_type: 'ai_finding',
  target_id: 'ai-finding-1',
  title: '零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸',
  summary: '两条记录语义重复，建议合并',
  created_at: '2026-08-07T10:00:00',
  entry_type: 'pitfall',
  content: '记录 A 的内容',
  project_id: 'project-1',
  project_name: '新房装修',
  node_id: 'node-fridge',
  node_path: ['家具家电', '冰箱'],
  entry_b_id: 'ai-b',
  entry_b_title: '零嵌冰箱侧边预留尺寸',
  entry_b_content: '记录 B 的内容',
  entry_b_project_id: 'project-1',
  entry_b_node_id: 'node-fridge',
  ai_description: '两条记录语义重复',
  ai_suggestion: '建议合并为一条记录',
  ai_severity: 'warning',
}

function findingKey(item: ReviewFinding): string {
  return `${item.finding_type}:${item.target_type}:${item.target_id}`
}

function makeScan(
  id: string,
  overrides: Partial<ReviewScan> = {},
): ReviewScan {
  return {
    id,
    scope_type: 'project',
    scope_id: 'project-1',
    status: 'succeeded',
    truncated: false,
    findings_count: 0,
    resurfaced_count: 0,
    skipped_rejected_count: 0,
    last_error: null,
    started_at: '2026-08-07T10:00:00',
    created_at: '2026-08-07T10:00:00',
    finished_at: '2026-08-07T10:02:00',
    scope_name: '冰箱',
    duration_seconds: 120,
    decision_summary: { resolved: 0, rejected: 0, pending: 0 },
    ...overrides,
  }
}

interface MockState {
  findings: ReviewFinding[]
  handled: Map<string, 'resolved' | 'rejected'>
  notes: Map<string, string>
  scans: ReviewScan[]
  scanPolls: Map<string, number>
  rejectScan: boolean
}

function reviewFetchMock(
  opts: {
    openFindings?: ReviewFinding[]
    scans?: ReviewScan[]
    rejectScan?: boolean
  } = {},
) {
  const state: MockState = {
    findings: [...(opts.openFindings ?? [])],
    handled: new Map(),
    notes: new Map(),
    scans: [...(opts.scans ?? [])],
    scanPolls: new Map(),
    rejectScan: opts.rejectScan ?? false,
  }
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const target = String(url)
    const method = init?.method ?? 'GET'

    if (target === '/api/projects') {
      return Promise.resolve(jsonResponse([{ id: 'project-1', name: '新房装修' }]))
    }
    if (target.includes('/api/projects/project-1/nodes')) {
      return Promise.resolve(jsonResponse([
        { id: 'node-fridge', project_id: 'project-1', parent_id: null, name: '冰箱' },
      ]))
    }
    const path = target.split('?')[0]
    if (path === '/api/review/scans') {
      if (method === 'POST') {
        if (state.rejectScan) {
          return Promise.resolve(jsonResponse(
            { detail: { code: 'scan_in_progress', message: '已有扫描进行中，请等待完成' } },
            409,
          ))
        }
        const scan = makeScan(`scan-${state.scans.length + 1}`, {
          status: 'pending',
          created_at: '2026-08-07T12:00:00',
          finished_at: null,
          duration_seconds: null,
        })
        state.scans.push(scan)
        return Promise.resolve(jsonResponse(scan))
      }
      const params = new URLSearchParams(target.split('?')[1] ?? '')
      const limit = Number(params.get('limit') ?? 20)
      const offset = Number(params.get('offset') ?? 0)
      const reversed = [...state.scans].reverse()
      return Promise.resolve(
        jsonResponse({
          scans: reversed.slice(offset, offset + limit),
          total: reversed.length,
        } satisfies ReviewScanListResponse),
      )
    }
    if (path.startsWith('/api/review/scans/')) {
      const scanId = path.split('/scans/')[1].split('/')[0]
      const polls = (state.scanPolls.get(scanId) ?? 0) + 1
      state.scanPolls.set(scanId, polls)
      const scan = state.scans.find((item) => item.id === scanId)
      if (scan && (scan.status === 'pending' || scan.status === 'running')) {
        if (polls === 1) {
          scan.status = 'running'
        } else if (polls >= 2) {
          scan.status = 'succeeded'
          scan.findings_count = 1
          scan.finished_at = '2026-08-07T12:02:00'
          scan.duration_seconds = 120
          scan.decision_summary = { resolved: 0, rejected: 0, pending: 1 }
          if (!state.findings.some((item) => item.target_id === aiFinding.target_id)) {
            state.findings.push(aiFinding)
          }
        }
      }
      return Promise.resolve(jsonResponse(scan))
    }
    if (target.includes('/api/review/findings') && !target.includes('/resolution')) {
      const view = target.includes('status=resolved')
        ? 'resolved'
        : target.includes('status=rejected')
          ? 'rejected'
          : 'open'
      const typeMatch = target.match(/[?&]type=([^&]+)/)
      const type = typeMatch ? decodeURIComponent(typeMatch[1]) : null
      let items = state.findings.filter((item) => {
        const state_ = state.handled.get(findingKey(item))
        if (view === 'open') return state_ === undefined
        return state_ === view
      })
      if (view !== 'open') {
        items = items.map((item) => ({
          ...item,
          resolution: view,
          note: state.notes.get(findingKey(item)) ?? '',
          resolved_at: '2026-08-07T11:00:00',
        }))
      }
      if (type) {
        items = items.filter((item) => item.finding_type === type)
      }
      return Promise.resolve(
        jsonResponse({ findings: items } satisfies ReviewFindingsResponse),
      )
    }
    if (target.includes('/resolution')) {
      const key = target
        .split('/api/review/findings/')[1]
        .replace('/resolution', '')
        .replaceAll('/', ':')
      if (method === 'DELETE') {
        state.handled.delete(key)
        state.notes.delete(key)
        return Promise.resolve(jsonResponse({ removed: true }))
      }
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      state.handled.set(key, body.resolution)
      state.notes.set(key, body.note ?? '')
      return Promise.resolve(jsonResponse({ handled: true }))
    }
    return Promise.resolve(jsonResponse({}))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, state }
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

async function selectProjectScope() {
  await userEvent.click(screen.getByRole('button', { name: /请选择审查范围/ }))
  await userEvent.click(screen.getByRole('button', { name: /^新房装修/ }))
}

describe('ReviewPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('lists open findings and filters by type', async () => {
    reviewFetchMock({ openFindings: [missingConditions] })
    renderReviewPage()

    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(screen.getAllByText('缺适用条件').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '疑似重复' }))
    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()
  })

  it('expands an entry finding and jumps to its node', async () => {
    reviewFetchMock({ openFindings: [missingConditions] })
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.click(screen.getByRole('button', { name: '查看详情' }))
    expect(screen.getByText('底部散热和两侧散热的预留要求不同。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '查看记录' }))
    expect(await screen.findByTestId('node-page')).toBeInTheDocument()
  })

  it('resolves a finding with a note, then undoes it', async () => {
    reviewFetchMock({ openFindings: [missingConditions] })
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.click(screen.getByRole('button', { name: '查看详情' }))
    await userEvent.type(
      screen.getByLabelText('备注：零嵌冰箱需要先确认散热方式'),
      '已补充适用条件',
    )
    await userEvent.click(screen.getByRole('button', { name: '标记已解决' }))
    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '已处理' }))
    expect(await screen.findByText('已解决：已补充适用条件')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(await screen.findByText('还没有已处理记录')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '待处理' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
  })

  it('rejects a finding and restores it from the rejected tab', async () => {
    reviewFetchMock({ openFindings: [missingConditions] })
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.click(screen.getByRole('button', { name: '拒绝' }))
    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '已拒绝' }))
    expect(
      await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '恢复' }))
    expect(await screen.findByText('还没有已拒绝记录')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '待处理' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
  })

  it('shows empty states for all tabs', async () => {
    reviewFetchMock()
    renderReviewPage()

    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '已处理' }))
    expect(await screen.findByText('还没有已处理记录')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '已拒绝' }))
    expect(await screen.findByText('还没有已拒绝记录')).toBeInTheDocument()
  })

  it('requires a scope before scanning', async () => {
    reviewFetchMock()
    renderReviewPage()

    await userEvent.click(screen.getByRole('button', { name: '开始审查' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请选择审查范围')
  })

  it('selects a node scope from the tree and remembers it', async () => {
    reviewFetchMock()
    const first = renderReviewPage()

    await userEvent.click(screen.getByRole('button', { name: /请选择审查范围/ }))
    await userEvent.click(screen.getByRole('button', { name: /^新房装修/ }))
    await userEvent.click(screen.getByRole('button', { name: /新房装修/ }))
    await userEvent.click(screen.getByRole('button', { name: '展开 新房装修' }))
    await userEvent.click(screen.getByRole('button', { name: /^冰箱/ }))

    expect(window.localStorage.getItem(scopeKey('user-1'))).toContain('node-fridge')
    first.unmount()
    renderReviewPage()
    expect(
      await screen.findByRole('button', { name: /新房装修 \/ 冰箱/ }),
    ).toBeInTheDocument()
  })

  it('starts a scan and the finding enters the pending list directly', async () => {
    const { fetchMock } = reviewFetchMock()
    renderReviewPage()
    await selectProjectScope()

    await userEvent.click(screen.getByRole('button', { name: '开始审查' }))
    expect(
      await screen.findByText('发现 1 条新问题', {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸' }),
    ).toBeInTheDocument()
    const findingsCalls = fetchMock.mock.calls.filter(
      ([url]) =>
        String(url).includes('/api/review/findings') &&
        String(url).includes('status=open'),
    )
    expect(findingsCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('shows re-surfaced and skipped counts in the scan result', async () => {
    reviewFetchMock({
      scans: [makeScan('scan-done', {
        status: 'succeeded',
        resurfaced_count: 2,
        skipped_rejected_count: 1,
        findings_count: 0,
        created_at: '2026-08-07T09:00:00',
      })],
    })
    renderReviewPage()

    expect(await screen.findByText(/发现 0 条新问题/)).toBeInTheDocument()
    expect(await screen.findByText(/2 条已处理问题已重新浮现/)).toBeInTheDocument()
    expect(await screen.findByText(/跳过已拒绝 1 条/)).toBeInTheDocument()
  })

  it('shows scan history with timing, results, and pagination', async () => {
    const scans = Array.from({ length: 21 }, (_, index) =>
      makeScan(`scan-${index + 1}`, {
        created_at: `2026-08-07T${String(9 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00`,
        decision_summary: {
          resolved: index % 3,
          rejected: index % 2,
          pending: 1,
        },
      }),
    )
    reviewFetchMock({ scans })
    renderReviewPage()

    await userEvent.click(screen.getByRole('tab', { name: '审查记录' }))
    expect(await screen.findAllByText(/开始 08-07 \d\d:\d\d:00 · 结束 08-07 10:02:00 · 耗时 2 分 0 秒/)).toHaveLength(20)
    expect((await screen.findAllByText(/决策跟进：已解决 \d+ · 已拒绝 \d+ · 待决定 1/)).length).toBeGreaterThan(0)

    const more = screen.getByRole('button', { name: '加载更多' })
    expect(more).toBeInTheDocument()
    await userEvent.click(more)
    expect(await screen.findAllByText(/开始 08-07 \d\d:\d\d:00 · 结束 08-07 10:02:00 · 耗时 2 分 0 秒/)).toHaveLength(21)
    expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument()
  })

  it('shows failed scan reasons in history detail', async () => {
    reviewFetchMock({
      scans: [makeScan('scan-fail', {
        status: 'failed',
        last_error: 'AI 服务未配置',
        finished_at: null,
        duration_seconds: null,
      })],
    })
    renderReviewPage()

    await userEvent.click(screen.getByRole('tab', { name: '审查记录' }))
    const card = (await screen.findByText('失败', { selector: '.badge' })).closest('article') as HTMLElement
    await userEvent.click(within(card).getByRole('button', { name: '详情' }))
    expect(await within(card).findByText('AI 服务未配置')).toBeInTheDocument()
  })

  it('shows an AI finding with pair evidence and jumps to record B', async () => {
    reviewFetchMock({ openFindings: [aiFinding] })
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸' })
    const card = screen.getByText('零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸').closest('article') as HTMLElement
    await userEvent.click(within(card).getByRole('button', { name: '查看详情' }))
    expect(within(card).getByText(/记录 A 的内容/)).toBeInTheDocument()
    expect(within(card).getByText(/记录 B 的内容/)).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: '查看记录 B' }))
    expect(await screen.findByTestId('node-page')).toBeInTheDocument()
  })

  it('resolves and undoes an AI finding', async () => {
    reviewFetchMock({ openFindings: [aiFinding] })
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸' })
    await userEvent.click(screen.getByRole('button', { name: '标记已解决' }))
    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '已处理' }))
    expect(await screen.findByText('已解决')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    await userEvent.click(screen.getByRole('tab', { name: '待处理' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸' })).toBeInTheDocument()
  })

  it('shows a toast when a concurrent scan is blocked', async () => {
    reviewFetchMock({ rejectScan: true })
    renderReviewPage()
    await selectProjectScope()

    await userEvent.click(screen.getByRole('button', { name: '开始审查' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('已有扫描进行中，请等待完成')
  })
})
