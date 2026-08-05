import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

function confirmFetch(overrides: { state?: SourceDetail } = {}) {
  let state = overrides.state ?? JSON.parse(JSON.stringify(detail)) as SourceDetail
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url.startsWith('/api/projects')) {
      return Promise.resolve(jsonResponse([
        { id: 'project-1', name: '新房装修', status: 'planning', node_count: 0, created_at: '', updated_at: '' },
      ]))
    }
    if (method === 'GET' && url.startsWith('/api/projects/project-1/nodes')) {
      return Promise.resolve(jsonResponse([
        { id: 'node-1', project_id: 'project-1', parent_id: null, name: '冰箱', description: null, sort_order: 0, created_at: '', updated_at: '' },
      ]))
    }
    if (method === 'GET' && url.startsWith('/api/inbox/sources/src-1')) {
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
    if (method === 'POST' && url.endsWith('/complete')) {
      const counts = state.extractions.reduce(
        (acc, item) => {
          acc[item.status] += 1
          return acc
        },
        { pending_confirm: 0, accepted: 0, rejected: 0 },
      )
      return Promise.resolve(jsonResponse({
        total: state.extractions.length,
        ...counts,
        completed: counts.pending_confirm === 0,
      }))
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
    const complete = await screen.findByRole('button', { name: '完成本资料' })
    await waitFor(() => expect(complete).not.toBeDisabled())
    await user.click(complete)
    expect(await screen.findByText(/完成：接受 1 条，拒绝 1 条/)).toBeInTheDocument()
    expect(screen.queryByText(/Extraction 不是正式知识/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '已完成' })).toBeDisabled()
  })

  it('flags low-confidence candidates', async () => {
    vi.stubGlobal('fetch', confirmFetch())
    renderRoute(<SourceConfirmPage />, '/inbox/src-1', '/inbox/:sourceId')
    expect((await screen.findAllByText(/低置信度 62%/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/置信度 94%/).length).toBeGreaterThan(0)
  })
})
