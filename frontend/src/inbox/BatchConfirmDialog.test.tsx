import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, renderRoute } from '../projects/testUtils'
import type { SourceDetail, SourceItem } from './types'
import BatchConfirmDialog from './BatchConfirmDialog'

const pendingSource: SourceItem = {
  id: 'src-1',
  source_type: 'text',
  title: '零嵌冰箱散热方式',
  content: '零嵌冰箱要看底部散热',
  link_url: null,
  content_status: 'saved',
  project_id: null,
  project_name: null,
  processing_state: 'pending_confirm',
  candidates: { pending_confirm: 3, accepted: 0, rejected: 0 },
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
}

const mixedSource: SourceItem = {
  ...pendingSource,
  id: 'src-2',
  title: '阳台防水经验',
  candidates: { pending_confirm: 2, accepted: 0, rejected: 0 },
}

function detail(source: SourceItem, extractions: SourceDetail['extractions']): SourceDetail {
  return {
    ...source,
    extractions,
    entries: [],
  }
}

function batchFetch(overrides: { failConfirm?: boolean } = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url === '/api/projects') {
      return Promise.resolve(jsonResponse([{ id: 'p1', name: '新房装修' }]))
    }
    if (method === 'GET' && url === '/api/projects/p1/nodes') {
      return Promise.resolve(jsonResponse([{ id: 'n1', name: '冰箱' }]))
    }
    if (method === 'GET' && url === '/api/inbox/sources/src-1') {
      return Promise.resolve(jsonResponse(detail(pendingSource, [
        {
          id: 'ex-1',
          source_id: 'src-1',
          status: 'pending_confirm',
          title: '底部散热更省空间',
          content: '底部散热内容',
          entry_type: 'pitfall',
          suggested_node_path: '家具家电 / 大家电 / 冰箱',
          applicable_conditions: ['嵌入橱柜安装'],
          risk_points: [],
          confidence: 0.9,
          decided_at: null,
          created_at: '2026-08-05T10:00:00',
          updated_at: '2026-08-05T10:00:00',
        },
        {
          id: 'ex-2',
          source_id: 'src-1',
          status: 'pending_confirm',
          title: '零嵌需要预留尺寸',
          content: '预留尺寸内容',
          entry_type: 'parameter',
          suggested_node_path: null,
          applicable_conditions: [],
          risk_points: [],
          confidence: 0.82,
          decided_at: null,
          created_at: '2026-08-05T10:00:00',
          updated_at: '2026-08-05T10:00:00',
        },
        {
          id: 'ex-3',
          source_id: 'src-1',
          status: 'pending_confirm',
          title: '疑似型号推断',
          content: '置信度低的内容',
          entry_type: 'experience',
          suggested_node_path: null,
          applicable_conditions: [],
          risk_points: [],
          confidence: 0.4,
          decided_at: null,
          created_at: '2026-08-05T10:00:00',
          updated_at: '2026-08-05T10:00:00',
        },
      ])))
    }
    if (method === 'GET' && url === '/api/inbox/sources/src-2') {
      return Promise.resolve(jsonResponse(detail(mixedSource, [
        {
          id: 'ex-4',
          source_id: 'src-2',
          status: 'pending_confirm',
          title: '防水层厚度要求',
          content: '厚度内容',
          entry_type: 'parameter',
          suggested_node_path: null,
          applicable_conditions: [],
          risk_points: [],
          confidence: 0.75,
          decided_at: null,
          created_at: '2026-08-05T10:00:00',
          updated_at: '2026-08-05T10:00:00',
        },
        {
          id: 'ex-5',
          source_id: 'src-2',
          status: 'pending_confirm',
          title: '品牌建议低置信',
          content: '低置信内容',
          entry_type: 'experience',
          suggested_node_path: null,
          applicable_conditions: [],
          risk_points: [],
          confidence: 0.3,
          decided_at: null,
          created_at: '2026-08-05T10:00:00',
          updated_at: '2026-08-05T10:00:00',
        },
      ])))
    }
    if (method === 'POST' && url === '/api/inbox/sources/batch/confirm') {
      if (overrides.failConfirm) {
        return Promise.resolve(jsonResponse({
          detail: { code: 'source_not_pending_confirm', message: '只有待确认的资料可以批量确认' },
        }, 409))
      }
      return Promise.resolve(jsonResponse({
        confirmed_sources: 2,
        entries_created: 3,
        skipped_low_confidence: 2,
      }, 200))
    }
    return Promise.resolve(jsonResponse({ detail: { code: 'not_found', message: '未找到' } }, 404))
  })
}

function renderDialog(onClose = vi.fn()) {
  return {
    onClose,
    user: userEvent.setup(),
    ...renderRoute(
      <BatchConfirmDialog
        sources={[pendingSource, mixedSource]}
        onClose={onClose}
      />,
      '/inbox',
      '*',
    ),
  }
}

describe('BatchConfirmDialog', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('previews candidates grouped by source and marks low confidence as excluded', async () => {
    vi.stubGlobal('fetch', batchFetch())
    renderDialog()

    expect(await screen.findByText('零嵌冰箱散热方式')).toBeInTheDocument()
    expect(screen.getByText('阳台防水经验')).toBeInTheDocument()
    expect(screen.getByText('底部散热更省空间')).toBeInTheDocument()
    expect(screen.getByText('零嵌需要预留尺寸')).toBeInTheDocument()
    expect(screen.getByText('防水层厚度要求')).toBeInTheDocument()
    expect(screen.getAllByText('不纳入批量')).toHaveLength(2)
    expect(screen.getByText(/已选 2 条资料/)).toBeInTheDocument()
    expect(screen.getByText(/共 3 条可确认候选/)).toBeInTheDocument()
    expect(screen.getByText(/2 条低置信度不纳入/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认生成 3 条正式记录' })).toBeDisabled()
  })

  it('allows unchecking a source and updates the confirm count', async () => {
    vi.stubGlobal('fetch', batchFetch())
    const { user } = renderDialog()

    await screen.findByText('底部散热更省空间')
    await user.click(screen.getByRole('checkbox', { name: '确认 零嵌冰箱散热方式' }))

    expect(screen.getByText(/已选 1 条资料/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认生成 1 条正式记录' })).toBeDisabled()
  })

  it('requires a project and includes the chosen node in the payload', async () => {
    const fetchMock = batchFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { user, onClose } = renderDialog()

    await screen.findByText('底部散热更省空间')
    await user.selectOptions(screen.getByRole('combobox', { name: '归档项目' }), 'p1')
    const nodeSelect = await screen.findByRole('combobox', { name: '统一归档节点' })
    await user.selectOptions(nodeSelect, 'n1')

    const confirmButton = screen.getByRole('button', { name: '确认生成 3 条正式记录' })
    expect(confirmButton).toBeEnabled()
    await user.click(confirmButton)

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
      expect(screen.getByText(/已确认 2 条来源，生成 3 条正式记录/)).toBeInTheDocument()
      const post = fetchMock.mock.calls.find(([url, init]) =>
        String(url) === '/api/inbox/sources/batch/confirm' && init?.method === 'POST') as
        [RequestInfo | URL, RequestInit] | undefined
      expect(post).toBeDefined()
      expect(JSON.parse(String(post![1].body))).toEqual({
        source_ids: ['src-1', 'src-2'],
        project_id: 'p1',
        node_id: 'n1',
      })
    })
  })

  it('keeps the dialog state and shows the error when submission fails', async () => {
    vi.stubGlobal('fetch', batchFetch({ failConfirm: true }))
    const { user, onClose } = renderDialog()

    await screen.findByText('底部散热更省空间')
    await user.selectOptions(screen.getByRole('combobox', { name: '归档项目' }), 'p1')
    await user.click(screen.getByRole('button', { name: '确认生成 3 条正式记录' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('只有待确认的资料可以批量确认')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: '归档项目' })).toHaveValue('p1')
    expect(screen.getByRole('checkbox', { name: '确认 零嵌冰箱散热方式' })).toBeChecked()
  })

  it('disables sources without any confirmable candidates', async () => {
    const onlyLow: SourceItem = {
      ...pendingSource,
      id: 'src-3',
      title: '全低置信资料',
      candidates: { pending_confirm: 1, accepted: 0, rejected: 0 },
    }
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (method === 'GET' && url === '/api/projects') {
        return Promise.resolve(jsonResponse([{ id: 'p1', name: '新房装修' }]))
      }
      if (method === 'GET' && url === '/api/inbox/sources/src-3') {
        return Promise.resolve(jsonResponse(detail(onlyLow, [
          {
            id: 'ex-6',
            source_id: 'src-3',
            status: 'pending_confirm',
            title: '不可信候选',
            content: '低置信内容',
            entry_type: 'experience',
            suggested_node_path: null,
            applicable_conditions: [],
            risk_points: [],
            confidence: 0.2,
            decided_at: null,
            created_at: '2026-08-05T10:00:00',
            updated_at: '2026-08-05T10:00:00',
          },
        ])))
      }
      return Promise.resolve(jsonResponse({ detail: { code: 'not_found', message: '未找到' } }, 404))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderRoute(
      <BatchConfirmDialog sources={[onlyLow]} onClose={vi.fn()} />,
      '/inbox',
      '*',
    )

    const checkbox = await screen.findByRole('checkbox', { name: '确认 全低置信资料' })
    expect(checkbox).toBeDisabled()
    expect(screen.getByText('无可批量确认候选')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认生成 0 条正式记录' })).toBeDisabled()
    expect(await screen.findByText('不可信候选')).toBeInTheDocument()
    const row = screen.getByText('全低置信资料').closest('.batch-source-row')
    expect(row && within(row as HTMLElement).getByText('不纳入批量')).toBeInTheDocument()
  })
})
