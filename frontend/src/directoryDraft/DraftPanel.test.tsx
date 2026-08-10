import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { jsonResponse } from '../projects/testUtils'
import DraftPanel from './DraftPanel'
import type { DirectoryDraft } from './types'

const PROJECT_ID = 'project-1'

function draft(overrides: Partial<DirectoryDraft> = {}): DirectoryDraft {
  return {
    id: 'draft-1',
    project_id: PROJECT_ID,
    status: 'pending_confirm',
    next_action: 'generate',
    intent_note: null,
    clarify: [],
    nodes: [
      { id: 'n1', parent_id: null, name: '硬装施工模块', description: null, selected: true, sort_order: 0 },
      { id: 'n2', parent_id: 'n1', name: '水电改造', description: null, selected: true, sort_order: 0 },
      { id: 'n3', parent_id: null, name: '家具家电', description: '大家电选购', selected: true, sort_order: 1 },
    ],
    last_error: null,
    created_at: '2026-08-10T10:00:00',
    updated_at: '2026-08-10T10:00:00',
    ...overrides,
  }
}

function renderPanel(value: DirectoryDraft) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DraftPanel projectId={PROJECT_ID} draft={value} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

function fetchMock() {
  const mock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (String(url).includes('/clarify')) {
      return Promise.resolve(jsonResponse(draft({ status: 'drafting' })))
    }
    if (String(url).includes('/refine')) {
      return Promise.resolve(jsonResponse(draft({ status: 'drafting' })))
    }
    if (String(url).includes('/confirm')) {
      return Promise.resolve(jsonResponse({ created_count: 3, status: 'confirmed' }))
    }
    if (String(url).includes('/discard')) {
      return Promise.resolve(jsonResponse(draft({ status: 'discarded' })))
    }
    if (String(url).includes('/retry')) {
      return Promise.resolve(jsonResponse(draft({ status: 'drafting' })))
    }
    if (String(url).includes('/redraft')) {
      return Promise.resolve(jsonResponse(draft({ status: 'drafting' })))
    }
    if (String(url).includes('/nodes/')) {
      if (method === 'DELETE') {
        return Promise.resolve(jsonResponse(draft()))
      }
      return Promise.resolve(jsonResponse({
        id: 'n1',
        parent_id: null,
        name: '新名称',
        description: null,
        selected: false,
        sort_order: 0,
      }))
    }
    return Promise.resolve(jsonResponse({}))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DraftPanel', () => {
  it('shows progress and a discard action while drafting', () => {
    renderPanel(draft({ status: 'drafting' }))
    expect(screen.getByText(/正在生成目录草稿/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /放弃草稿/ })).toBeInTheDocument()
  })

  it('renders clarification questions and submits answers or skips', async () => {
    const mock = fetchMock()
    renderPanel(draft({
      status: 'awaiting_input',
      clarify: [
        { id: 'q1', text: '目前处于装修哪个阶段？', options: ['设计', '施工', '采购'] },
      ],
    }))

    expect(screen.getByText('目前处于装修哪个阶段？')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('施工'))
    await userEvent.click(screen.getByRole('button', { name: '生成目录' }))

    await waitFor(() => {
      const call = mock.mock.calls.find(([url]) => String(url).includes('/clarify'))
      expect(call).toBeDefined()
      const body = JSON.parse(String(call![1]?.body))
      expect(body.answers).toEqual({ q1: '施工' })
    })

    await userEvent.click(screen.getByRole('button', { name: '跳过，直接生成' }))
    await waitFor(() => {
      const calls = mock.mock.calls.filter(([url]) => String(url).includes('/clarify'))
      expect(calls.length).toBe(2)
      expect(JSON.parse(String(calls[1][1]?.body)).answers).toEqual({})
    })
  })

  it('toggles, renames and deletes draft nodes', async () => {
    const mock = fetchMock()
    renderPanel(draft())

    await userEvent.click(screen.getByLabelText('选择 硬装施工模块'))
    await waitFor(() => {
      const call = mock.mock.calls.find(
        ([url, init]) => String(url).includes('/nodes/') && (init?.method ?? '') === 'PATCH',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]?.body))).toEqual({ selected: false })
    })

    await userEvent.click(screen.getByRole('button', { name: '改名 家具家电' }))
    const input = screen.getByLabelText('修改 家具家电 名称')
    await userEvent.clear(input)
    await userEvent.type(input, '家电家具')
    fireEvent.blur(input)
    await waitFor(() => {
      const call = mock.mock.calls.find(
        ([url, init]) => String(url).includes('/nodes/') && (init?.method ?? '') === 'PATCH' && JSON.parse(String(init?.body)).name,
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]?.body))).toEqual({ name: '家电家具' })
    })

    await userEvent.click(screen.getByRole('button', { name: '删除 水电改造' }))
    await waitFor(() => {
      expect(mock.mock.calls.some(
        ([url, init]) => String(url).includes('/nodes/n2') && (init?.method ?? '') === 'DELETE',
      )).toBe(true)
    })
  })

  it('submits a refinement instruction and confirms the draft', async () => {
    const mock = fetchMock()
    renderPanel(draft())

    await userEvent.type(
      screen.getByPlaceholderText(/更侧重施工流程/),
      '去掉预算类节点',
    )
    await userEvent.click(screen.getByRole('button', { name: /重新生成/ }))
    await waitFor(() => {
      const call = mock.mock.calls.find(([url]) => String(url).includes('/refine'))
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]?.body))).toEqual({ instruction: '去掉预算类节点' })
    })

    await userEvent.click(screen.getByRole('button', { name: /确认采用/ }))
    await waitFor(() => {
      expect(mock.mock.calls.some(([url]) => String(url).includes('/confirm'))).toBe(true)
    })
    expect(await screen.findByText(/已创建 3 个节点/)).toBeInTheDocument()
  })

  it('shows failure state with retry and redraft actions', async () => {
    const mock = fetchMock()
    renderPanel(draft({ status: 'failed', last_error: 'AI 服务调用失败' }))

    expect(screen.getByText('AI 服务调用失败')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /重试/ }))
    await waitFor(() => {
      expect(mock.mock.calls.some(([url]) => String(url).includes('/retry'))).toBe(true)
    })
  })
})
