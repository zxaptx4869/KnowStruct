import { screen, waitFor } from '@testing-library/react'
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
  return { id, project_id: project.id, parent_id, name, description: null, sort_order, created_at: timestamp, updated_at: timestamp }
}

function mockProjectApi(nodesResponse: Node[] = nodes) {
  return vi.fn((url: string) => {
    if (url === '/api/projects/project-1') return Promise.resolve(jsonResponse(project))
    if (url === '/api/projects/project-1/nodes') return Promise.resolve(jsonResponse(nodesResponse))
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

    await userEvent.click(screen.getByRole('button', { name: '新建根节点' }))
    await userEvent.type(screen.getByLabelText('节点名称'), '家具家电')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

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
    expect(screen.getByRole('dialog', { name: '移动节点' })).toBeInTheDocument()
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
