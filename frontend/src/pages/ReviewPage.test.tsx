import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../components/Toast'
import { jsonResponse } from '../projects/testUtils'
import { scopeKey } from '../review/scope'
import type {
  ReviewCandidate,
  ReviewCandidatesResponse,
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

const candidate: ReviewCandidate = {
  id: 'ai-finding-1',
  review_type: 'duplicate',
  status: 'candidate',
  description: '两条记录语义重复，建议合并',
  suggestion: '建议合并为一条记录',
  severity: 'warning',
  entry_a: {
    id: 'ai-a',
    title: '零嵌冰箱需要先确认散热方式',
    content: '记录 A 的内容',
    entry_type: 'pitfall',
    project_id: 'project-1',
    project_name: '新房装修',
    node_id: 'node-fridge',
    node_path: ['家具家电', '冰箱'],
  },
  entry_b: {
    id: 'ai-b',
    title: '零嵌冰箱侧边预留尺寸',
    content: '记录 B 的内容',
    entry_type: 'parameter',
    project_id: 'project-1',
    project_name: '新房装修',
    node_id: 'node-fridge',
    node_path: ['家具家电', '冰箱'],
  },
}

function findingKey(item: ReviewFinding): string {
  return `${item.finding_type}:${item.target_type}:${item.target_id}`
}

interface MockState {
  findings: ReviewFinding[]
  candidates: ReviewCandidate[]
  handled: Set<string>
  notes: Map<string, string>
  resolutions: Map<string, 'resolved' | 'ignored'>
  scans: ReviewScan[]
  scanPolls: Map<string, number>
  rejectScan: boolean
}

function reviewFetchMock(
  opts: {
    openFindings?: ReviewFinding[]
    candidates?: ReviewCandidate[]
    scans?: ReviewScan[]
    rejectScan?: boolean
  } = {},
) {
  const state: MockState = {
    findings: [...(opts.openFindings ?? [])],
    candidates: [...(opts.candidates ?? [])],
    handled: new Set(),
    notes: new Map(),
    resolutions: new Map(),
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
    if (target === '/api/review/scans') {
      if (method === 'POST') {
        if (state.rejectScan) {
          return Promise.resolve(jsonResponse(
            { detail: { code: 'scan_in_progress', message: '已有扫描进行中，请等待完成' } },
            409,
          ))
        }
        const scan: ReviewScan = {
          id: `scan-${state.scans.length + 1}`,
          scope_type: 'project',
          scope_id: 'project-1',
          status: 'pending',
          truncated: false,
          findings_count: 0,
          resurfaced_count: 0,
          last_error: null,
          started_at: null,
          created_at: '2026-08-07T10:00:00',
          finished_at: null,
        }
        state.scans.push(scan)
        return Promise.resolve(jsonResponse(scan))
      }
      return Promise.resolve(
        jsonResponse({
          scans: [...state.scans].reverse(),
        } satisfies ReviewScanListResponse),
      )
    }
    if (target.includes('/api/review/scans/') && target.includes('/candidates')) {
      return Promise.resolve(
        jsonResponse({ candidates: state.candidates } satisfies ReviewCandidatesResponse),
      )
    }
    if (target.includes('/api/review/scans/')) {
      const scanId = target.split('/scans/')[1].split('/')[0]
      const polls = (state.scanPolls.get(scanId) ?? 0) + 1
      state.scanPolls.set(scanId, polls)
      const scan = state.scans.find((item) => item.id === scanId)
      if (scan && (scan.status === 'pending' || scan.status === 'running')) {
        if (polls === 1) {
          scan.status = 'running'
          scan.started_at = '2026-08-07T10:00:00'
        } else if (polls >= 2) {
          scan.status = 'succeeded'
          scan.findings_count = state.candidates.length
          scan.finished_at = '2026-08-07T10:02:00'
        }
      }
      return Promise.resolve(jsonResponse(scan))
    }
    if (target.includes('/api/review/findings/ai/')) {
      const findingId = target.split('/findings/ai/')[1].split('/')[0]
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      const matched = state.candidates.find((item) => item.id === findingId)
      state.candidates = state.candidates.filter((item) => item.id !== findingId)
      if (body.decision === 'confirmed' && matched) {
        state.findings.push({
          finding_type: matched.review_type,
          target_type: 'ai_finding',
          target_id: matched.id,
          title: `${matched.entry_a.title} vs ${matched.entry_b.title}`,
          summary: matched.description,
          created_at: '2026-08-07T10:00:00',
          entry_type: matched.entry_a.entry_type,
          content: matched.entry_a.content,
          project_id: matched.entry_a.project_id,
          project_name: matched.entry_a.project_name,
          node_id: matched.entry_a.node_id,
          node_path: matched.entry_a.node_path,
          entry_b_id: matched.entry_b.id,
          entry_b_title: matched.entry_b.title,
          entry_b_content: matched.entry_b.content,
          entry_b_project_id: matched.entry_b.project_id,
          entry_b_node_id: matched.entry_b.node_id,
          ai_description: matched.description,
          ai_suggestion: matched.suggestion,
          ai_severity: matched.severity,
        })
      }
      return Promise.resolve(
        jsonResponse({ status: body.decision === 'confirmed' ? 'open' : 'rejected' }),
      )
    }
    if (target.includes('/api/review/findings') && !target.includes('/resolution')) {
      const resolvedView = target.includes('status=resolved')
      const typeMatch = target.match(/[?&]type=([^&]+)/)
      const type = typeMatch ? decodeURIComponent(typeMatch[1]) : null
      let items = resolvedView
        ? state.findings
            .filter((item) => state.handled.has(findingKey(item)))
            .map((item) => ({
              ...item,
              resolution: state.resolutions.get(findingKey(item)) ?? 'resolved',
              note: state.notes.get(findingKey(item)) ?? '',
              resolved_at: '2026-08-07T10:00:00',
            }))
        : state.findings.filter((item) => !state.handled.has(findingKey(item)))
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
        state.resolutions.delete(key)
        return Promise.resolve(jsonResponse({ removed: true }))
      }
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      state.handled.add(key)
      state.notes.set(key, body.note ?? '')
      state.resolutions.set(key, body.resolution)
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
    reviewFetchMock({ openFindings: [missingConditions, longPending] })
    renderReviewPage()

    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
    expect(screen.getByText('吊顶材料待确认')).toBeInTheDocument()
    expect(screen.getAllByText('缺适用条件').length).toBeGreaterThan(0)
    expect(screen.getAllByText('长期待确认').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: '长期待确认' }))
    expect(await screen.findByText('吊顶材料待确认')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).not.toBeInTheDocument()
  })

  it('expands an entry finding and jumps to its node', async () => {
    reviewFetchMock({ openFindings: [missingConditions] })
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
    reviewFetchMock({ openFindings: [longPending] })
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
    expect(await screen.findByText('还没有处理记录')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '待处理' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })).toBeInTheDocument()
  })

  it('ignores a finding', async () => {
    reviewFetchMock({ openFindings: [missingConditions] })
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式' })
    await userEvent.click(screen.getByRole('button', { name: '忽略' }))
    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '已处理' }))
    expect(await screen.findByText('已忽略')).toBeInTheDocument()
  })

  it('shows the empty state when there are no findings', async () => {
    reviewFetchMock()
    renderReviewPage()

    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()
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

  it('starts a scan and confirms a candidate into the open list', async () => {
    const { fetchMock } = reviewFetchMock({ candidates: [candidate] })
    renderReviewPage()
    await selectProjectScope()

    await userEvent.click(screen.getByRole('button', { name: '开始审查' }))
    const scanCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/review/scans') && (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(scanCall).toBeDefined()
    expect(String(scanCall![1]?.body)).toContain('"scope_type":"project"')

    expect(
      await screen.findByText('扫描完成：发现 1 条新候选', {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(await screen.findByText('两条记录语义重复，建议合并')).toBeInTheDocument()
    const findingsCalls = fetchMock.mock.calls.filter(
      ([url]) =>
        String(url).includes('/api/review/findings') &&
        String(url).includes('status=open'),
    )
    expect(findingsCalls.length).toBeGreaterThanOrEqual(2)

    await userEvent.click(screen.getByRole('button', { name: '确认为问题' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸' })).toBeInTheDocument()
    expect(screen.getAllByText('疑似重复').length).toBeGreaterThan(0)
  })

  it('rejects a candidate and it stays out of the list', async () => {
    reviewFetchMock({ candidates: [candidate] })
    renderReviewPage()
    await selectProjectScope()

    await userEvent.click(screen.getByRole('button', { name: '开始审查' }))
    await screen.findByText('扫描完成：发现 1 条新候选', {}, { timeout: 5000 })
    await screen.findByText('两条记录语义重复，建议合并')
    await userEvent.click(screen.getByRole('button', { name: '拒绝' }))

    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()
    expect(screen.queryByText('两条记录语义重复，建议合并')).not.toBeInTheDocument()
  })

  it('resumes a running scan after returning to the page', async () => {
    reviewFetchMock({
      scans: [{
        id: 'scan-old',
        scope_type: 'project',
        scope_id: 'project-1',
        status: 'pending',
        truncated: false,
        findings_count: 0,
        resurfaced_count: 0,
        last_error: null,
        started_at: null,
        created_at: '2026-08-07T10:00:00',
        finished_at: null,
      }],
    })
    renderReviewPage()

    expect(await screen.findByText(/正在扫描该范围/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '扫描中' })).toBeDisabled()
  })

  it('resumes a succeeded scan and shows its candidates', async () => {
    reviewFetchMock({
      candidates: [candidate],
      scans: [{
        id: 'scan-done',
        scope_type: 'project',
        scope_id: 'project-1',
        status: 'succeeded',
        truncated: false,
        findings_count: 1,
        resurfaced_count: 2,
        last_error: null,
        started_at: '2026-08-07T10:00:00',
        created_at: '2026-08-07T10:00:00',
        finished_at: '2026-08-07T10:02:00',
      }],
    })
    renderReviewPage()

    expect(await screen.findByText(/扫描完成：发现 1 条新候选/)).toBeInTheDocument()
    expect(await screen.findByText(/2 条已处理问题已重新浮现/)).toBeInTheDocument()
    expect(await screen.findByText('两条记录语义重复，建议合并')).toBeInTheDocument()
  })

  it('shows a toast when a concurrent scan is blocked', async () => {
    reviewFetchMock({ rejectScan: true })
    renderReviewPage()
    await selectProjectScope()

    await userEvent.click(screen.getByRole('button', { name: '开始审查' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('已有扫描进行中，请等待完成')
  })

  it('shows an AI finding with pair evidence and jumps to record B', async () => {
    reviewFetchMock({ openFindings: [aiFinding] })
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸' })
    const card = screen.getByText('零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸').closest('article') as HTMLElement
    await userEvent.click(within(card).getByRole('button', { name: '查看详情' }))

    expect(within(card).getByText('两条记录语义重复')).toBeInTheDocument()
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
})
