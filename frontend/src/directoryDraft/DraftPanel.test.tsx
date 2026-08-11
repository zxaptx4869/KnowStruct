import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    target_node_id: null,
    status: 'pending_confirm',
    next_action: 'generate',
    intent_note: null,
    clarify: [],
    diff: [],
    messages: [],
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
    if (String(url).includes('/messages')) {
      return Promise.resolve(jsonResponse({ draft: draft({ status: 'pending_confirm' }), messages: [] }))
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
        { id: 'q1', text: '目前处于装修哪个阶段？', options: ['设计', '施工', '采购'], multiple: false },
      ],
    }))

    expect(screen.getByText('目前处于装修哪个阶段？')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /放弃草稿/ })).toBeInTheDocument()
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

  it('renders multi-choice questions with an other input and submits arrays', async () => {
    const mock = fetchMock()
    renderPanel(draft({
      status: 'awaiting_input',
      clarify: [
        { id: 'q1', text: '旅游时长？', options: ['7 天', '10 天'], multiple: false },
        { id: 'q2', text: '希望涵盖哪些方面？', options: ['自然风光', '人文', '美食'], multiple: true },
      ],
    }))

    const q1 = screen.getAllByRole('group')[0]
    const q2 = screen.getAllByRole('group')[1]

    await userEvent.click(within(q1).getByLabelText('其他'))
    await userEvent.type(within(q1).getByPlaceholderText('请输入自定义内容'), '15 天')

    await userEvent.click(within(q2).getByLabelText('自然风光'))
    await userEvent.click(within(q2).getByLabelText('美食'))
    await userEvent.click(within(q2).getByLabelText('其他'))
    await userEvent.type(within(q2).getByPlaceholderText('请输入自定义内容'), '自驾路线')

    await userEvent.click(screen.getByRole('button', { name: '生成目录' }))
    await waitFor(() => {
      const call = mock.mock.calls.find(([url]) => String(url).includes('/clarify'))
      expect(call).toBeDefined()
      const body = JSON.parse(String(call![1]?.body))
      expect(body.answers).toEqual({
        q1: '15 天',
        q2: ['自然风光', '美食', '自驾路线'],
      })
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

  it('sends a chat message via the messages endpoint and confirms the draft', async () => {
    const mock = fetchMock()
    renderPanel(draft())

    await userEvent.type(
      screen.getByPlaceholderText(/和 AI 讨论目录/),
      '把名称缩短',
    )
    await userEvent.click(screen.getByRole('button', { name: /发送/ }))
    await waitFor(() => {
      const call = mock.mock.calls.find(([url]) => String(url).includes('/messages'))
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]?.body))).toEqual({ content: '把名称缩短' })
    })

    await userEvent.click(screen.getByRole('button', { name: /确认采用/ }))
    await waitFor(() => {
      expect(mock.mock.calls.some(([url]) => String(url).includes('/confirm'))).toBe(true)
    })
    expect(await screen.findByText(/已创建 3 个节点/)).toBeInTheDocument()
  })

  it('renders conversation bubbles with an applied-tree marker', () => {
    renderPanel(draft({
      messages: [
        { id: 'm1', role: 'user', content: '把名称缩短', created_at: '2026-08-10T10:00:01' },
        { id: 'm2', role: 'assistant', content: '已按你的要求更新目录。', created_at: '2026-08-10T10:00:02' },
        { id: 'm3', role: 'system', content: '已应用目录，共 8 个节点', created_at: '2026-08-10T10:00:03' },
      ],
    }))

    expect(screen.getByText('把名称缩短')).toBeInTheDocument()
    expect(screen.getByText('已按你的要求更新目录。')).toBeInTheDocument()
    expect(screen.getByText('已更新目录（8 个节点）')).toBeInTheDocument()
  })

  it('shows a readable error and keeps input on send failure for retry', async () => {
    const mock = fetchMock()
    mock.mockImplementationOnce(() => Promise.reject(new Error('network down')))
    renderPanel(draft())

    const input = screen.getByPlaceholderText(/和 AI 讨论目录/)
    await userEvent.type(input, '增加一个收纳节点')
    await userEvent.click(screen.getByRole('button', { name: /发送/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/无法连接服务器|发送失败/)
    expect(input).toHaveValue('增加一个收纳节点')
  })

  it('shows failure state with retry and redraft actions', async () => {
    const mock = fetchMock()
    renderPanel(draft({ status: 'failed', last_error: 'AI 服务调用失败' }))

    expect(screen.getByText('AI 服务调用失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /放弃草稿/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /重试/ }))
    await waitFor(() => {
      expect(mock.mock.calls.some(([url]) => String(url).includes('/retry'))).toBe(true)
    })
  })

  it('renders expansion diff and confirms with selected removal ids', async () => {
    const mock = fetchMock()
    renderPanel(draft({
      target_node_id: 'node-1',
      diff: [
        {
          kind: 'kept',
          node: { id: 'd1', name: '风格确定', description: null, selected: true },
          real_node_id: 'r1',
          name: null,
          description: null,
          blocked: false,
          blocker_count: 0,
          children: [],
        },
        {
          kind: 'added',
          node: { id: 'd2', name: '新增细分节点', description: 'AI 建议补充', selected: true },
          real_node_id: null,
          name: null,
          description: null,
          blocked: false,
          blocker_count: 0,
          children: [],
        },
        {
          kind: 'removed',
          node: null,
          real_node_id: 'r2',
          name: '待删除节点',
          description: null,
          blocked: false,
          blocker_count: 0,
          children: [],
        },
      ],
    }))

    expect(screen.getByText('AI 节点拓展')).toBeInTheDocument()
    expect(screen.getByText('风格确定')).toBeInTheDocument()
    expect(screen.getByText('新增细分节点')).toBeInTheDocument()
    expect(screen.getByText('待删除节点')).toBeInTheDocument()

    // 建议移除项默认勾选
    expect(screen.getByLabelText('移除 待删除节点')).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: /确认采用/ }))
    await waitFor(() => {
      const call = mock.mock.calls.find(([url]) => String(url).includes('/confirm'))
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]?.body))).toEqual({ removed_node_ids: ['r2'] })
    })
  })

  it('lets users uncheck a removal to keep the node', async () => {
    const mock = fetchMock()
    renderPanel(draft({
      target_node_id: 'node-1',
      diff: [
        {
          kind: 'removed',
          node: null,
          real_node_id: 'r2',
          name: '待删除节点',
          description: null,
          blocked: false,
          blocker_count: 0,
          children: [],
        },
      ],
    }))

    const removal = screen.getByLabelText('移除 待删除节点')
    expect(removal).toBeChecked()
    await userEvent.click(removal)
    expect(removal).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: /确认采用/ }))
    await waitFor(() => {
      const call = mock.mock.calls.find(([url]) => String(url).includes('/confirm'))
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]?.body))).toEqual({ removed_node_ids: [] })
    })
  })

  it('keeps user-unchecked removals after a refetch with the same diff', async () => {
    const base = draft({
      target_node_id: 'node-1',
      diff: [
        {
          kind: 'removed',
          node: null,
          real_node_id: 'r2',
          name: '待删除节点',
          description: null,
          blocked: false,
          blocker_count: 0,
          children: [],
        },
      ],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <DraftPanel projectId={PROJECT_ID} draft={base} />
        </ToastProvider>
      </QueryClientProvider>,
    )

    const removal = screen.getByLabelText('移除 待删除节点')
    expect(removal).toBeChecked()
    await userEvent.click(removal)
    expect(removal).not.toBeChecked()

    rerender(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <DraftPanel
            projectId={PROJECT_ID}
            draft={{ ...base, diff: JSON.parse(JSON.stringify(base.diff)) }}
          />
        </ToastProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByLabelText('移除 待删除节点')).not.toBeChecked()
  })

  it('default-checks nested removals under kept nodes', async () => {
    renderPanel(draft({
      target_node_id: 'node-1',
      diff: [
        {
          kind: 'kept',
          node: { id: 'd1', name: '保留节点', description: null, selected: true },
          real_node_id: 'r1',
          name: null,
          description: null,
          blocked: false,
          blocker_count: 0,
          children: [
            {
              kind: 'removed',
              node: null,
              real_node_id: 'r3',
              name: '嵌套移除',
              description: null,
              blocked: false,
              blocker_count: 0,
              children: [],
            },
          ],
        },
      ],
    }))

    // kept 节点带子差异时默认折叠，先展开
    await userEvent.click(screen.getByText('保留节点'))
    expect(screen.getByLabelText('移除 嵌套移除')).toBeChecked()
  })

  it('disables removal of blocked nodes and shows blocker count', () => {
    renderPanel(draft({
      target_node_id: 'node-1',
      diff: [
        {
          kind: 'removed',
          node: null,
          real_node_id: 'r2',
          name: '有记录节点',
          description: null,
          blocked: true,
          blocker_count: 2,
          children: [],
        },
      ],
    }))
    expect(screen.getByText('受保护内容 2 条，不可移除')).toBeInTheDocument()
    expect(screen.getByLabelText('移除 有记录节点')).toBeDisabled()
    expect(screen.getByLabelText('移除 有记录节点')).not.toBeChecked()
  })

  it('lets users toggle and rename added expansion nodes', async () => {
    const mock = fetchMock()
    renderPanel(draft({
      target_node_id: 'node-1',
      diff: [
        {
          kind: 'added',
          node: { id: 'd2', name: '新增细分节点', description: 'AI 建议补充', selected: true },
          real_node_id: null,
          name: null,
          description: null,
          blocked: false,
          blocker_count: 0,
          children: [],
        },
      ],
    }))

    await userEvent.click(screen.getByLabelText('采用 新增细分节点'))
    await waitFor(() => {
      const call = mock.mock.calls.find(
        ([url, init]) => String(url).includes('/nodes/d2') && (init?.method ?? '') === 'PATCH',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]?.body))).toEqual({ selected: false })
    })

    await userEvent.click(screen.getByRole('button', { name: '改名 新增细分节点' }))
    const input = screen.getByLabelText('修改 新增细分节点 名称')
    await userEvent.clear(input)
    await userEvent.type(input, '细分维度')
    fireEvent.blur(input)
    await waitFor(() => {
      const call = mock.mock.calls.find(
        ([url, init]) => String(url).includes('/nodes/d2')
          && (init?.method ?? '') === 'PATCH'
          && JSON.parse(String(init?.body)).name,
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]?.body))).toEqual({ name: '细分维度' })
    })
  })

  it('collapses into a target-node banner when viewing another node', async () => {
    const mock = fetchMock()
    const onGo = vi.fn()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <DraftPanel
            projectId={PROJECT_ID}
            draft={draft({ target_node_id: 'node-1' })}
            currentNodeId="node-2"
            targetNodeName="装修准备"
            onGoToTargetNode={onGo}
          />
        </ToastProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByText(/AI 拓展草稿：正在拓展「装修准备」/)).toBeInTheDocument()
    expect(screen.queryByText('AI 节点拓展')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /回到节点继续处理/ }))
    expect(onGo).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: /放弃草稿/ }))
    await waitFor(() => {
      expect(mock.mock.calls.some(([url]) => String(url).includes('/discard'))).toBe(true)
    })
  })
})
