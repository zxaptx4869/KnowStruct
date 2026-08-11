import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../components/Toast'
import { jsonResponse, renderRoute } from '../projects/testUtils'
import type { SourceDetail } from '../inbox/types'
import SourceConfirmPage from './SourceConfirmPage'

const detail: SourceDetail = {
  id: 'src-1',
  source_type: 'text',
  title: '零嵌冰箱安装避坑截图',
  content: '零嵌冰箱要看底部散热，先确认散热方式再决定预留尺寸。',
  link_url: null,
  content_status: 'saved',
  project_id: null,
  project_name: null,
  processing_state: 'pending_confirm',
  candidates: { pending_confirm: 2, accepted: 0, rejected: 0 },
  task: {
    stage: 'ai_extraction',
    status: 'succeeded',
    attempt_count: 1,
    last_error: null,
    claimed_at: null,
    started_at: null,
    finished_at: null,
  },
  created_at: '2026-08-05T10:00:00',
  updated_at: '2026-08-05T10:00:00',
  entries: [],
  extractions: [
    {
      id: 'ext-1',
      source_id: 'src-1',
      status: 'pending_confirm',
      title: '散热方式决定侧边预留',
      content: '零嵌冰箱需要先确认散热方式，再决定柜体侧边预留尺寸。',
      entry_type: 'pitfall',
      suggested_node_path: '家具家电 / 大家电 / 冰箱',
      applicable_conditions: ['嵌入橱柜安装；以具体型号安装图为准。'],
      risk_points: [],
      confidence: 0.94,
      decided_at: null,
      created_at: '2026-08-05T10:00:00',
      updated_at: '2026-08-05T10:00:00',
    },
    {
      id: 'ext-2',
      source_id: 'src-1',
      status: 'pending_confirm',
      title: '底部散热型号的安装余量',
      content: '底部散热型号左右通常只需少量安装余量。',
      entry_type: 'parameter',
      suggested_node_path: null,
      applicable_conditions: [],
      risk_points: [],
      confidence: 0.62,
      decided_at: null,
      created_at: '2026-08-05T10:00:00',
      updated_at: '2026-08-05T10:00:00',
    },
  ],
}

function confirmFetch(overrides: {
  state?: SourceDetail
  nodes?: Array<Record<string, unknown>>
  projects?: Array<Record<string, unknown>>
} = {}) {
  let state = overrides.state ?? JSON.parse(JSON.stringify(detail)) as SourceDetail
  const mockNodes = overrides.nodes ?? [
    { id: 'node-1', project_id: 'project-1', parent_id: null, name: '冰箱', description: null, sort_order: 0, created_at: '', updated_at: '' },
  ]
  const mockProjects = overrides.projects ?? [
    { id: 'project-1', name: '新房装修', status: 'planning', node_count: 0, created_at: '', updated_at: '' },
  ]
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url === '/api/projects') {
      return Promise.resolve(jsonResponse(mockProjects))
    }
    if (url.startsWith('/api/projects/project-1/nodes')) {
      if (method === 'GET') {
        return Promise.resolve(jsonResponse(mockNodes))
      }
      const body = JSON.parse(String(init?.body)) as { name: string, parent_id?: string | null }
      const created = {
        id: `new-${body.name}`,
        project_id: 'project-1',
        parent_id: body.parent_id ?? null,
        name: body.name,
        description: null,
        sort_order: mockNodes.length,
        created_at: '',
        updated_at: '',
      }
      mockNodes.push(created)
      return Promise.resolve(jsonResponse(created, 201))
    }
    if (method === 'GET' && url.startsWith('/api/inbox/sources/src-1')) {
      return Promise.resolve(jsonResponse(state))
    }
    if (method === 'POST' && url.includes('/assign')) {
      const body = JSON.parse(String(init?.body)) as { project_id: string }
      state = { ...state, project_id: body.project_id, project_name: '新房装修' }
      return Promise.resolve(jsonResponse(state))
    }
    if (method === 'POST' && url.includes('/decide')) {
      const extractionId = url.split('/extractions/')[1].split('/')[0]
      const extraction = state.extractions.find((item) => item.id === extractionId)
      if (!extraction) return Promise.resolve(jsonResponse({ detail: { code: 'not_found', message: '未找到' } }, 404))
      const body = JSON.parse(String(init?.body)) as { decision: 'accepted' | 'rejected' }
      if (body.decision === 'accepted') {
        extraction.status = 'accepted'
        return Promise.resolve(jsonResponse({
          decision: 'accepted',
          extraction_id: extractionId,
          entry: { id: 'entry-1', project_id: 'project-1', node_id: null, entry_type: 'pitfall', title: extraction.title, status: 'archived', created_at: '2026-08-05T10:00:00' },
        }))
      }
      extraction.status = 'rejected'
      return Promise.resolve(jsonResponse({ decision: 'rejected', extraction_id: extractionId, entry: null }))
    }
    return Promise.resolve(jsonResponse({ detail: { code: 'not_found', message: '未找到' } }, 404))
  })
}

describe('SourceConfirmPage confirmation flow', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('blocks acceptance until a project is selected', async () => {
    vi.stubGlobal('fetch', confirmFetch())
    const user = userEvent.setup()
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    const acceptButtons = await screen.findAllByRole('button', { name: '接受并生成正式记录' })
    await user.click(acceptButtons[0])
    expect(await screen.findByText('接受前请先选择归档项目')).toBeInTheDocument()
    const projectSelect = await screen.findByLabelText(/归档项目/)
    expect(projectSelect).toHaveAttribute('aria-invalid', 'true')
    expect(projectSelect).toHaveClass('field-error')
    expect(projectSelect).toHaveFocus()
  })

  it('accepts a candidate with a selected project and enables completion', async () => {
    const fetchMock = confirmFetch()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    expect((await screen.findAllByText('散热方式决定侧边预留')).length).toBeGreaterThan(0)
    await user.selectOptions(await screen.findByLabelText(/归档项目/), 'project-1')
    await user.click((await screen.findAllByRole('button', { name: '接受并生成正式记录' }))[0])

    await waitFor(() => {
      const decideCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).includes('/decide') && init?.method === 'POST') as
        [RequestInfo | URL, RequestInit] | undefined
      expect(decideCall).toBeDefined()
      const body = JSON.parse(String(decideCall![1].body))
      expect(body).toMatchObject({ decision: 'accepted', project_id: 'project-1' })
    })

    await user.click((await screen.findAllByRole('button', { name: '拒绝' }))[0])
    expect(await screen.findByText(/已处理完成：接受 1 条，拒绝 1 条/)).toBeInTheDocument()
    expect(screen.queryByText(/Extraction 不是正式知识/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '完成本资料' })).not.toBeInTheDocument()
  })

  it('flags low-confidence candidates', async () => {
    vi.stubGlobal('fetch', confirmFetch())
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')
    expect((await screen.findAllByText(/低置信度 62%/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/置信度 94%/).length).toBeGreaterThan(0)
  })

  it('shows related formal entries and navigates to the node detail', async () => {
    const state: SourceDetail = {
      ...JSON.parse(JSON.stringify(detail)) as SourceDetail,
      processing_state: 'done',
      project_id: 'project-1',
      entries: [
        {
          id: 'entry-1',
          entry_type: 'pitfall',
          title: '散热方式决定侧边预留',
          project_id: 'project-1',
          node_id: 'node-1',
          created_at: '2026-08-05T10:00:00',
        },
      ],
    }
    vi.stubGlobal('fetch', confirmFetch({ state }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/inbox/src-1']}>
          <ToastProvider>
            <Routes>
              <Route path="/inbox/:sourceId" element={<SourceConfirmPage />} />
              <Route path="/projects/:id/nodes/:nid" element={<div data-testid="node-page">节点详情页</div>} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('关联正式记录')).toBeInTheDocument()
    const relatedRow = screen.getByRole('button', { name: /散热方式决定侧边预留/ })
    expect(relatedRow).toBeInTheDocument()
    await userEvent.click(relatedRow)
    expect(await screen.findByTestId('node-page')).toBeInTheDocument()
  })

  it('shows the auto-applied recommended project', async () => {
    const state: SourceDetail = {
      ...JSON.parse(JSON.stringify(detail)) as SourceDetail,
      project_id: 'project-1',
      recommended_project_id: 'project-1',
      recommended_project_name: '新房装修',
      recommended_confidence: 0.9,
      recommended_reason: '内容与装修直接相关',
    }
    vi.stubGlobal('fetch', confirmFetch({ state }))
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    expect(await screen.findByText(/AI 已建议归档：/)).toBeInTheDocument()
    expect(screen.getByLabelText(/归档项目/)).toHaveValue('project-1')
    expect(screen.queryByRole('button', { name: '使用' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '忽略' })).not.toBeInTheDocument()
  })

  it('shows a manual selection hint when the recommendation could not be determined', async () => {
    vi.stubGlobal('fetch', confirmFetch())
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    expect(
      await screen.findByText(/AI 未能可靠判断归档项目，请手动选择/),
    ).toBeInTheDocument()
  })

  it('hides the manual selection hint when the source is already assigned', async () => {
    const state: SourceDetail = {
      ...JSON.parse(JSON.stringify(detail)) as SourceDetail,
      project_id: 'project-1',
      project_name: '新房装修',
    }
    vi.stubGlobal('fetch', confirmFetch({ state }))
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    await screen.findByLabelText('归档项目')
    expect(screen.queryByText(/AI 未能可靠判断归档项目，请手动选择/)).not.toBeInTheDocument()
  })

  it('hides the manual selection hint when the workspace has no projects', async () => {
    vi.stubGlobal('fetch', confirmFetch({ projects: [] }))
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    await screen.findByLabelText('归档项目')
    expect(screen.queryByText(/AI 未能可靠判断归档项目，请手动选择/)).not.toBeInTheDocument()
  })

  it('hides the manual selection hint while the source is processing', async () => {
    const state: SourceDetail = {
      ...JSON.parse(JSON.stringify(detail)) as SourceDetail,
      processing_state: 'processing',
      extractions: [],
      candidates: { pending_confirm: 0, accepted: 0, rejected: 0 },
    }
    vi.stubGlobal('fetch', confirmFetch({ state }))
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    await screen.findByText('AI 提取中')
    expect(screen.queryByText(/AI 未能可靠判断归档项目，请手动选择/)).not.toBeInTheDocument()
  })

  it('hides the manual selection hint after the user picks a project', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', confirmFetch())
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    expect(
      await screen.findByText(/AI 未能可靠判断归档项目，请手动选择/),
    ).toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText(/归档项目/), 'project-1')
    expect(screen.queryByText(/AI 未能可靠判断归档项目，请手动选择/)).not.toBeInTheDocument()
  })

  it('hides the manual selection hint after all candidates are decided', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', confirmFetch())
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    await screen.findByText(/AI 未能可靠判断归档项目，请手动选择/)
    const rejectButtons = await screen.findAllByRole('button', { name: '拒绝' })
    await user.click(rejectButtons[0])
    await user.click((await screen.findAllByRole('button', { name: '拒绝' }))[0])

    expect(await screen.findByText(/已处理完成：接受 0 条，拒绝 2 条/)).toBeInTheDocument()
    expect(screen.queryByText(/AI 未能可靠判断归档项目，请手动选择/)).not.toBeInTheDocument()
  })

  it('preselects a fully matched suggested node', async () => {
    const state: SourceDetail = {
      ...JSON.parse(JSON.stringify(detail)) as SourceDetail,
      project_id: 'project-1',
      extractions: [
        {
          ...detail.extractions[0],
          suggested_node_path: '家具家电 / 大家电 / 冰箱',
          suggested_node_confidence: 0.9,
        },
      ],
    }
    const nodes = [
      { id: 'r1', project_id: 'project-1', parent_id: null, name: '家具家电', description: null, sort_order: 0, created_at: '', updated_at: '' },
      { id: 'c1', project_id: 'project-1', parent_id: 'r1', name: '大家电', description: null, sort_order: 0, created_at: '', updated_at: '' },
      { id: 'c2', project_id: 'project-1', parent_id: 'c1', name: '冰箱', description: null, sort_order: 0, created_at: '', updated_at: '' },
    ]
    vi.stubGlobal('fetch', confirmFetch({ state, nodes }))
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    const nodeSelects = await screen.findAllByLabelText(/归档节点/)
    await waitFor(() => {
      for (const select of nodeSelects) {
        expect(select).toHaveValue('c2')
      }
    })
    expect(
      screen.getAllByText(/AI 建议：家具家电 \/ 大家电 \/ 冰箱/).length,
    ).toBeGreaterThan(0)
  })

  it('keeps 暂不归档 after the user clears a preselected node', async () => {
    const state: SourceDetail = {
      ...JSON.parse(JSON.stringify(detail)) as SourceDetail,
      project_id: 'project-1',
      extractions: [
        {
          ...detail.extractions[0],
          suggested_node_path: '家具家电 / 大家电 / 冰箱',
          suggested_node_confidence: 0.9,
        },
      ],
    }
    const nodes = [
      { id: 'r1', project_id: 'project-1', parent_id: null, name: '家具家电', description: null, sort_order: 0, created_at: '', updated_at: '' },
      { id: 'c1', project_id: 'project-1', parent_id: 'r1', name: '大家电', description: null, sort_order: 0, created_at: '', updated_at: '' },
      { id: 'c2', project_id: 'project-1', parent_id: 'c1', name: '冰箱', description: null, sort_order: 0, created_at: '', updated_at: '' },
    ]
    vi.stubGlobal('fetch', confirmFetch({ state, nodes }))
    const user = userEvent.setup()
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    const nodeSelects = await screen.findAllByLabelText(/归档节点/)
    await waitFor(() => {
      expect(nodeSelects[0]).toHaveValue('c2')
    })
    await user.selectOptions(nodeSelects[0], '')
    expect(nodeSelects[0]).toHaveValue('')
    await waitFor(() => {
      expect(nodeSelects[0]).toHaveValue('')
    })
  })

  it('offers explicit creation for missing path segments', async () => {
    const state: SourceDetail = {
      ...JSON.parse(JSON.stringify(detail)) as SourceDetail,
      project_id: 'project-1',
      extractions: [
        {
          ...detail.extractions[0],
          suggested_node_path: '家具家电 / 大家电 / 洗衣机',
          suggested_node_confidence: 0.9,
        },
      ],
    }
    const nodes = [
      { id: 'r1', project_id: 'project-1', parent_id: null, name: '家具家电', description: null, sort_order: 0, created_at: '', updated_at: '' },
      { id: 'c1', project_id: 'project-1', parent_id: 'r1', name: '大家电', description: null, sort_order: 0, created_at: '', updated_at: '' },
    ]
    const fetchMock = confirmFetch({ state, nodes })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    expect((await screen.findAllByText(/建议新建：洗衣机/)).length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: '新建该节点' })[0])

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([url, init]) =>
        String(url).startsWith('/api/projects/project-1/nodes') && init?.method === 'POST') as
        [RequestInfo | URL, RequestInit] | undefined
      expect(createCall).toBeDefined()
      expect(JSON.parse(String(createCall![1].body))).toEqual({
        name: '洗衣机',
        parent_id: 'c1',
      })
    })
    const nodeSelects = await screen.findAllByLabelText(/归档节点/)
    await waitFor(() => {
      for (const select of nodeSelects) {
        expect(select).toHaveValue('new-洗衣机')
      }
    })
  })

  it('degrades to manual selection on low suggestion confidence', async () => {
    const state: SourceDetail = {
      ...JSON.parse(JSON.stringify(detail)) as SourceDetail,
      project_id: 'project-1',
      extractions: [
        {
          ...detail.extractions[0],
          suggested_node_path: '家具家电 / 大家电 / 冰箱',
          suggested_node_confidence: 0.4,
        },
      ],
    }
    vi.stubGlobal('fetch', confirmFetch({ state }))
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    expect(
      (await screen.findAllByText(/AI 未能可靠判断归档节点，请手动选择/)).length,
    ).toBeGreaterThan(0)
    const nodeSelects = await screen.findAllByLabelText(/归档节点/)
    for (const select of nodeSelects) {
      expect(select).toHaveValue('')
    }
  })

  it('does not suggest creating a brand-new root for unmatched paths', async () => {
    const state: SourceDetail = {
      ...JSON.parse(JSON.stringify(detail)) as SourceDetail,
      project_id: 'project-1',
      extractions: [
        {
          ...detail.extractions[0],
          suggested_node_path: '旅行 / 昆明 / 景点选择',
          suggested_node_confidence: 0.8,
        },
      ],
    }
    const nodes = [
      { id: 'r1', project_id: 'project-1', parent_id: null, name: '云南5天自由行攻略', description: null, sort_order: 0, created_at: '', updated_at: '' },
    ]
    vi.stubGlobal('fetch', confirmFetch({ state, nodes }))
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')

    expect(
      (await screen.findAllByText(/AI 未能可靠判断归档节点，请手动选择/)).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '新建该节点' })).not.toBeInTheDocument()
    expect(screen.queryByText(/建议新建：/)).not.toBeInTheDocument()
  })
})
