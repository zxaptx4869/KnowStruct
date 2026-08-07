import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, renderRoute } from '../projects/testUtils'
import type { Project } from '../projects/types'
import HomePage from './HomePage'

const project: Project = {
  id: 'project-1',
  name: '新房装修',
  goal: '整理施工和采购经验',
  background: '设计方案已确认',
  status: 'active',
  node_count: 6,
  entry_count: 0,
  unarchived_entry_count: 0,
  created_at: '2026-08-04T10:00:00',
  updated_at: '2026-08-04T11:00:00',
}

describe('HomePage project experience', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('distinguishes the no-project state from loading and offers capture', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
    renderRoute(<HomePage />)

    expect(await screen.findByRole('heading', { name: '还没有项目' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建项目' })).toBeInTheDocument()
    expect(screen.getByText(/点击右上角「创建项目」开始/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '创建第一个项目' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '前往采集箱' })).not.toBeInTheDocument()
  })

  it('renders real status and node totals on desktop and mobile paths', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([project])))
    renderRoute(<HomePage />)

    expect((await screen.findAllByText('新房装修')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('进行中').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('6 个目录节点')).toBeInTheDocument()
  })

  it('preserves create input and blocks duplicate submission after an API failure', async () => {
    let resolveCreate: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/projects' && init?.method === 'POST') {
        return new Promise<Response>((resolve) => { resolveCreate = resolve })
      }
      return Promise.resolve(jsonResponse([]))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderRoute(<HomePage />)
    await screen.findByRole('heading', { name: '还没有项目' })

    await userEvent.click(screen.getByRole('button', { name: '创建项目' }))
    await userEvent.type(screen.getByLabelText('项目名称'), '新房装修')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '创建项目' }))
    expect(screen.getByRole('button', { name: '保存中' })).toBeDisabled()
    resolveCreate?.(jsonResponse({ detail: { code: 'request_failed', message: '暂时无法保存' } }, 500))

    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法保存')
    expect(screen.getByLabelText('项目名称')).toHaveValue('新房装修')
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
  })

  it('confirms project deletion by name and refreshes the list', async () => {
    let deleted = false
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/projects/project-1' && init?.method === 'DELETE') {
        deleted = true
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (url === '/api/projects') return Promise.resolve(jsonResponse(deleted ? [] : [project]))
      return Promise.resolve(jsonResponse(project))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderRoute(<HomePage />)
    await screen.findAllByText('新房装修')

    await userEvent.click(screen.getAllByRole('button', { name: '管理 新房装修' })[0])
    await userEvent.click(screen.getByRole('button', { name: '删除项目' }))
    expect(screen.getByRole('heading', { name: '删除“新房装修”项目？' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '删除项目' }))
    await waitFor(() => expect(deleted).toBe(true))
  })
})
