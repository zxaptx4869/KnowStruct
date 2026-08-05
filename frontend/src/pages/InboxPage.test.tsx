import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, renderRoute } from '../projects/testUtils'
import type { SourceItem } from '../inbox/types'
import InboxPage from './InboxPage'

const source: SourceItem = {
  id: 'src-1',
  source_type: 'text',
  title: '零嵌冰箱散热方式',
  content: '零嵌冰箱要看底部散热',
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
}

function inboxFetch(overrides: { sources?: SourceItem[], failCapture?: boolean } = {}) {
  const sources = overrides.sources ?? [source]
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url.startsWith('/api/projects')) {
      return Promise.resolve(jsonResponse([]))
    }
    if (method === 'GET' && url.startsWith('/api/inbox/sources')) {
      return Promise.resolve(jsonResponse(sources))
    }
    if (method === 'POST' && url.startsWith('/api/inbox/sources')) {
      if (overrides.failCapture) {
        return Promise.resolve(jsonResponse({
          detail: { code: 'request_failed', message: '采集失败，请检查输入后重试' },
        }, 422))
      }
      return Promise.resolve(jsonResponse({ ...source, id: 'src-new' }, 201))
    }
    return Promise.resolve(jsonResponse({ detail: { code: 'not_found', message: '未找到' } }, 404))
  })
}

describe('InboxPage capture and queue', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the empty inbox state', async () => {
    vi.stubGlobal('fetch', inboxFetch({ sources: [] }))
    renderRoute(<InboxPage />, '/inbox', '/inbox')

    expect(await screen.findByText('暂无采集项')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保存原始来源/ })).toBeInTheDocument()
  })

  it('captures text and navigates to the source detail', async () => {
    const fetchMock = inboxFetch()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderRoute(<InboxPage />, '/inbox', '/inbox')

    const input = await screen.findByPlaceholderText(/粘贴或输入文字/)
    await user.type(input, '厨房插座定位现场记录')
    await user.click(screen.getByRole('button', { name: /保存原始来源/ }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, init]) =>
        String(url) === '/api/inbox/sources' && init?.method === 'POST') as
        [RequestInfo | URL, RequestInit] | undefined
      expect(post).toBeDefined()
      const body = JSON.parse(String(post![1].body))
      expect(body).toEqual({
        source_type: 'text',
        content: '厨房插座定位现场记录',
        link_url: undefined,
        project_id: undefined,
      })
    })
  })

  it('preserves input and shows an error when capture fails', async () => {
    vi.stubGlobal('fetch', inboxFetch({ failCapture: true }))
    const user = userEvent.setup()
    renderRoute(<InboxPage />, '/inbox', '/inbox')

    const input = await screen.findByPlaceholderText(/粘贴或输入文字/)
    await user.type(input, '保留这段输入')
    await user.click(screen.getByRole('button', { name: /保存原始来源/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('采集失败')
    expect(input).toHaveValue('保留这段输入')
  })

  it('filters the queue by processing state', async () => {
    const fetchMock = inboxFetch()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderRoute(<InboxPage />, '/inbox', '/inbox')

    expect((await screen.findAllByText('零嵌冰箱散热方式')).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '失败' }))

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith('/api/inbox/sources'))
      expect(calls.some(([url]) => String(url).includes('state=failed'))).toBe(true)
    })
  })

  it('shows a retry action for failed sources', async () => {
    const failed: SourceItem = {
      ...source,
      processing_state: 'failed',
      task: { ...source.task!, status: 'failed', last_error: '模拟失败' },
    }
    const fetchMock = inboxFetch({ sources: [failed] })
    vi.stubGlobal('fetch', fetchMock)
    renderRoute(<InboxPage />, '/inbox', '/inbox')

    const retry = (await screen.findAllByRole('button', { name: '重试' }))[0]
    expect(retry).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(retry)

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) =>
        String(url) === '/api/inbox/sources/src-1/retry' && init?.method === 'POST')).toBe(true)
    })
  })

  it('shows stage-aware labels for processing sources', async () => {
    const pending: SourceItem = {
      ...source,
      id: 'src-pending',
      processing_state: 'processing',
      task: { ...source.task!, status: 'pending', stage: 'ocr' },
    }
    const runningOcr: SourceItem = {
      ...source,
      id: 'src-ocr',
      processing_state: 'processing',
      task: { ...source.task!, status: 'running', stage: 'ocr' },
    }
    const runningExtract: SourceItem = {
      ...source,
      id: 'src-extract',
      processing_state: 'processing',
      task: { ...source.task!, status: 'running', stage: 'ai_extraction' },
    }
    vi.stubGlobal('fetch', inboxFetch({
      sources: [pending, runningOcr, runningExtract],
    }))
    renderRoute(<InboxPage />, '/inbox', '/inbox')

    expect((await screen.findAllByText('待处理')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('图片识别中').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AI 提取中').length).toBeGreaterThan(0)
  })
})
