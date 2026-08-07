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
  scan: {
    id: string
    status: string
    findings_count: number
    truncated: boolean
    last_error: string | null
  } | null
}

function reviewFetchMock(
  opts: { openFindings?: ReviewFinding[]; candidates?: ReviewCandidate[] } = {},
) {
  const state: MockState = {
    findings: [...(opts.openFindings ?? [])],
    candidates: [...(opts.candidates ?? [])],
    handled: new Set(),
    notes: new Map(),
    resolutions: new Map(),
    scan: null,
  }
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const target = String(url)
    const method = init?.method ?? 'GET'

    if (target === '/api/projects') {
      return Promise.resolve(jsonResponse([{ id: 'project-1', name: '新房装修' }]))
    }
    if (target.includes('/api/projects/project-1/nodes')) {
      return Promise.resolve(jsonResponse([{ id: 'node-fridge', name: '冰箱' }]))
    }
    if (target.includes('/api/review/scans') && !target.includes('/candidates')) {
      if (method === 'POST') {
        state.scan = {
          id: 'scan-1',
          status: 'pending',
          findings_count: 0,
          truncated: false,
          last_error: null,
        }
        return Promise.resolve(jsonResponse(state.scan))
      }
      if (state.scan) {
        state.scan.status = 'succeeded'
        state.scan.findings_count = state.candidates.length
      }
      return Promise.resolve(jsonResponse(state.scan))
    }
    if (target.includes('/candidates')) {
      return Promise.resolve(
        jsonResponse({ candidates: state.candidates } satisfies ReviewCandidatesResponse),
      )
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

  it('starts a scan and confirms a candidate into the open list', async () => {
    const { fetchMock } = reviewFetchMock({ candidates: [candidate] })
    renderReviewPage()

    await userEvent.click(screen.getByRole('button', { name: '开始审查' }))
    const scanCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/review/scans') && (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(scanCall).toBeDefined()
    expect(String(scanCall![1]?.body)).toContain('workspace')

    expect(await screen.findByText('扫描完成：发现 1 条候选')).toBeInTheDocument()
    expect(await screen.findByText('两条记录语义重复，建议合并')).toBeInTheDocument()
    expect(screen.getByText('建议：建议合并为一条记录')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '确认为问题' }))
    expect(await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸' })).toBeInTheDocument()
    expect(screen.getAllByText('疑似重复').length).toBeGreaterThan(0)
  })

  it('rejects a candidate and it stays out of the list', async () => {
    reviewFetchMock({ candidates: [candidate] })
    renderReviewPage()

    await userEvent.click(screen.getByRole('button', { name: '开始审查' }))
    await screen.findByText('扫描完成：发现 1 条候选')
    await userEvent.click(screen.getByRole('button', { name: '拒绝' }))

    expect(await screen.findByText('没有待处理问题')).toBeInTheDocument()
    expect(screen.queryByText('两条记录语义重复，建议合并')).not.toBeInTheDocument()
  })

  it('shows an AI finding with pair evidence and jumps to record B', async () => {
    reviewFetchMock({ openFindings: [aiFinding] })
    renderReviewPage()

    await screen.findByRole('heading', { name: '零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸' })
    const card = screen.getByText('零嵌冰箱需要先确认散热方式 vs 零嵌冰箱侧边预留尺寸').closest('article') as HTMLElement
    await userEvent.click(within(card).getByRole('button', { name: '查看详情' }))

    expect(within(card).getByText('两条记录语义重复')).toBeInTheDocument()
    expect(within(card).getByText('建议合并为一条记录')).toBeInTheDocument()
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

  it('selects a node scope and remembers it for the next visit', async () => {
    reviewFetchMock({ openFindings: [] })
    const first = renderReviewPage()

    const scopeSelect = screen.getByLabelText('审查范围')
    await userEvent.selectOptions(scopeSelect, 'node')
    await userEvent.selectOptions(screen.getByLabelText('选择项目'), 'project-1')
    await userEvent.selectOptions(screen.getByLabelText('选择节点'), 'node-fridge')

    expect(window.localStorage.getItem(scopeKey('user-1'))).toContain('node-fridge')

    first.unmount()
    renderReviewPage()
    expect(await screen.findByRole('option', { name: '新房装修' })).toBeInTheDocument()
    expect(screen.getByLabelText('审查范围')).toHaveValue('node')
    expect(screen.getByLabelText('选择项目')).toHaveValue('project-1')
    expect(screen.getByLabelText('选择节点')).toHaveValue('node-fridge')
  })
})
