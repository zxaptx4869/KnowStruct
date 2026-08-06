import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, renderRoute } from '../projects/testUtils'
import type { Node, Project } from '../projects/types'
import ProjectDetailPage from './ProjectDetailPage'

const project: Project = {
  id: 'project-1',
  name: '新房装修',
  goal: '整理施工和采购经验',
  background: null,
  status: 'active',
  node_count: 4,
  created_at: '2026-08-04T10:00:00',
  updated_at: '2026-08-04T11:00:00',
}
const timestamp = '2026-08-04T10:00:00'
const nodes: Node[] = [
  node('furniture', null, '家具家电', 0),
  node('construction', null, '硬装施工', 1),
  node('appliances', 'furniture', '大家电', 0),
  node('fridge', 'appliances', '冰箱', 0),
]

function node(id: string, parent_id: string | null, name: string, sort_order: number): Node {
  return { id, project_id: project.id, parent_id, name, description: null, sort_order, entry_count: 0, created_at: timestamp, updated_at: timestamp }
}

function mockProjectApi(nodesResponse: Node[] = nodes) {
  return vi.fn((url: string) => {
    if (url === '/api/projects/project-1') return Promise.resolve(jsonResponse(project))
    if (url === '/api/projects/project-1/nodes') return Promise.resolve(jsonResponse(nodesResponse))
    if (url.includes('/entries')) return Promise.resolve(jsonResponse([]))
    if (url === '/api/projects') return Promise.resolve(jsonResponse([project]))
    return Promise.resolve(jsonResponse({}))
  })
}

describe('ProjectDetailPage directory experience', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders desktop tree and mobile drill-down from the same data', async () => {
    vi.stubGlobal('fetch', mockProjectApi())
    renderRoute(<ProjectDetailPage />, '/projects/project-1/nodes/appliances', '/projects/:id/nodes/:nid')

    expect((await screen.findAllByText('大家电')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: '上一层' })).toBeInTheDocument()
    expect(screen.getByText('新房装修 / 家具家电 / 大家电')).toBeInTheDocument()
    expect(screen.getAllByText('冰箱').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('还没有节点说明。')).toHaveLength(2)
    expect(screen.queryByText(project.goal!)).not.toBeInTheDocument()
    expect(screen.getByText('项目根目录')).toBeInTheDocument()
  })

  it('uses the accessible move menu and maps it to the move API', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/fridge/move') && init?.method === 'POST') return Promise.resolve(jsonResponse({ ...nodes[3], parent_id: 'construction' }))
      return mockProjectApi()(url)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderRoute(<ProjectDetailPage />, '/projects/project-1/nodes/fridge', '/projects/:id/nodes/:nid')
    await screen.findAllByText('冰箱')

    const manageButton = screen.getByRole('button', { name: '管理 冰箱' })
    vi.spyOn(manageButton, 'getBoundingClientRect').mockReturnValue({
      x: 242,
      y: 700,
      width: 28,
      height: 28,
      top: 700,
      right: 270,
      bottom: 728,
      left: 242,
      toJSON: () => ({}),
    })
    await userEvent.click(manageButton)
    const nodeMenu = screen.getByTestId('node-menu-fridge')
    expect(nodeMenu.parentElement).toBe(document.body)
    expect(Number.parseFloat(nodeMenu.style.top)).toBeLessThan(700)
    await userEvent.click(screen.getByRole('button', { name: '移动到…' }))
    await userEvent.selectOptions(screen.getByLabelText('目标父节点'), 'construction')
    await userEvent.click(screen.getByRole('button', { name: '移动' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => (
      String(url).endsWith('/fridge/move')
      && init?.method === 'POST'
      && init.body === JSON.stringify({ parent_id: 'construction', position: 0 })
    ))).toBe(true))
  })

  it('keeps node input after a duplicate-name mutation failure', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/nodes') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({
          detail: { code: 'duplicate_node_name', message: 'duplicate' },
        }, 409))
      }
      return mockProjectApi()(url)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderRoute(<ProjectDetailPage />, '/projects/project-1', '/projects/:id')
    await screen.findAllByText('家具家电')

    await userEvent.click(screen.getAllByRole('button', { name: '创建根节点' })[0])
    await userEvent.type(screen.getByLabelText('节点名称'), '家具家电')
    await userEvent.click(screen.getByRole('button', { name: '创建节点' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('同级目录中已存在同名节点')
    expect(screen.getByLabelText('节点名称')).toHaveValue('家具家电')
  })

  it('keeps the move dialog open with a stable six-level conflict message', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/furniture/move') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({
          detail: { code: 'node_depth_exceeded', message: 'too deep' },
        }, 409))
      }
      return mockProjectApi()(url)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderRoute(<ProjectDetailPage />, '/projects/project-1/nodes/furniture', '/projects/:id/nodes/:nid')
    await screen.findAllByText('家具家电')

    await userEvent.click(screen.getByRole('button', { name: '管理 家具家电' }))
    await userEvent.click(screen.getByRole('button', { name: '移动到…' }))
    await userEvent.selectOptions(screen.getByLabelText('目标父节点'), 'construction')
    await userEvent.click(screen.getByRole('button', { name: '移动' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('知识目录最多支持 6 层')
    expect(screen.getByRole('dialog', { name: '移动“家具家电”' })).toBeInTheDocument()
  })

  it('shows descendant count before deleting a subtree', async () => {
    vi.stubGlobal('fetch', mockProjectApi())
    renderRoute(<ProjectDetailPage />, '/projects/project-1', '/projects/:id')
    await screen.findAllByText('家具家电')

    await userEvent.click(screen.getByRole('button', { name: '管理 家具家电' }))
    await userEvent.click(screen.getByRole('button', { name: '删除子树' }))
    expect(screen.getByText('将永久删除 3 个目录节点，当前版本无法恢复。')).toBeInTheDocument()
  })

  it('does not misrepresent a directory loading error as an empty directory', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.endsWith('/nodes')) return Promise.resolve(jsonResponse({ detail: { code: 'request_failed' } }, 500))
      return Promise.resolve(jsonResponse(project))
    }))
    renderRoute(<ProjectDetailPage />, '/projects/project-1', '/projects/:id')

    expect(await screen.findByRole('alert')).toHaveTextContent('项目目录加载失败')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.queryByText('知识目录为空')).not.toBeInTheDocument()
  })
})

const entryRows = [
  {
    id: 'entry-1',
    entry_type: 'pitfall',
    title: '散热方式决定侧边预留',
    content: '零嵌冰箱需要先确认散热方式，再决定柜体预留尺寸。',
    applicable_conditions: ['底部散热型号', '以安装图为准'],
    sources: [
      { id: 'src-1', source_type: 'text', title: '零嵌冰箱安装避坑截图' },
    ],
    created_at: timestamp,
  },
  {
    id: 'entry-2',
    entry_type: 'parameter',
    title: '冰箱位净宽 915mm',
    content: '复尺数据，需保留插座位置。',
    applicable_conditions: null,
    sources: [],
    created_at: timestamp,
  },
]

function recordsFetch(overrides: { entries?: unknown[] } = {}) {
  return vi.fn((url: string) => {
    if (String(url).includes('/entries')) {
      return Promise.resolve(jsonResponse(overrides.entries ?? entryRows))
    }
    return mockProjectApi()(url)
  })
}

describe('node detail records section', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders records with type filter, conditions and source chips', async () => {
    vi.stubGlobal('fetch', recordsFetch())
    const { container } = renderRoute(<ProjectDetailPage />, '/projects/project-1/nodes/appliances', '/projects/:id/nodes/:nid')
    await screen.findAllByText('大家电')
    const desktop = container.querySelector('.desktop-directory') as HTMLElement

    expect(await within(desktop).findByText('散热方式决定侧边预留')).toBeInTheDocument()
    expect(within(desktop).getByText('冰箱位净宽 915mm')).toBeInTheDocument()
    expect(within(desktop).getByText('适用条件：底部散热型号；以安装图为准')).toBeInTheDocument()
    expect(within(desktop).getByRole('button', { name: '打开来源：零嵌冰箱安装避坑截图' })).toBeInTheDocument()

    await userEvent.click(within(desktop).getByRole('button', { name: '避坑' }))
    expect(within(desktop).getByText('散热方式决定侧边预留')).toBeInTheDocument()
    expect(within(desktop).queryByText('冰箱位净宽 915mm')).not.toBeInTheDocument()

    await userEvent.click(within(desktop).getByRole('button', { name: '全部' }))
    expect(within(desktop).getByText('冰箱位净宽 915mm')).toBeInTheDocument()
  })

  it('shows an empty hint when the node has no records', async () => {
    vi.stubGlobal('fetch', recordsFetch({ entries: [] }))
    const { container } = renderRoute(<ProjectDetailPage />, '/projects/project-1/nodes/appliances', '/projects/:id/nodes/:nid')
    await screen.findAllByText('大家电')
    const desktop = container.querySelector('.desktop-directory') as HTMLElement

    expect(await within(desktop).findByText('该节点还没有正式记录')).toBeInTheDocument()
  })

  it('keeps the node context and retries after a record loading failure', async () => {
    let attempts = 0
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('/entries')) {
        attempts += 1
        if (attempts === 1) {
          return Promise.resolve(jsonResponse({ detail: { code: 'request_failed', message: 'boom' } }, 500))
        }
        return Promise.resolve(jsonResponse(entryRows))
      }
      return mockProjectApi()(url)
    }))
    const { container } = renderRoute(<ProjectDetailPage />, '/projects/project-1/nodes/appliances', '/projects/:id/nodes/:nid')
    await screen.findAllByText('大家电')
    const desktop = container.querySelector('.desktop-directory') as HTMLElement

    expect(await within(desktop).findByRole('alert')).toHaveTextContent('正式记录加载失败')
    expect(within(desktop).getAllByText('大家电').length).toBeGreaterThan(0)
    await userEvent.click(within(desktop).getByRole('button', { name: '重试' }))
    expect(await within(desktop).findByText('散热方式决定侧边预留')).toBeInTheDocument()
  })

  it('shows entry count badges in the tree and opens a record source', async () => {
    const nodesWithCounts = nodes.map((item) =>
      item.id === 'appliances' ? { ...item, entry_count: 3 } : item,
    )
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('/entries')) {
        return Promise.resolve(jsonResponse(entryRows))
      }
      return mockProjectApi(nodesWithCounts)(url)
    }))
    const { container } = renderRoute(
      <ProjectDetailPage />,
      '/projects/project-1/nodes/furniture',
      '/projects/:id/nodes/:nid',
    )

    await screen.findAllByText('大家电')
    await screen.findAllByText('散热方式决定侧边预留')
    await waitFor(() => {
      const count = container.querySelectorAll('.tree-entry-count').length
      expect(count, `tree badges ${count}`).toBeGreaterThan(0)
    })
    await waitFor(() => {
      const count = container.querySelectorAll('.mobile-entry-count').length
      expect(count, `mobile badges ${count}`).toBeGreaterThan(0)
    })
  })
})
