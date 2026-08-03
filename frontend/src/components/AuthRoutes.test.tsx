import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/context'
import type { AuthContextValue, AuthStatus } from '../auth/types'
import { ProtectedRoute, PublicOnlyRoute } from './AuthRoutes'

function authValue(status: AuthStatus): AuthContextValue {
  return {
    status,
    user: status === 'authenticated' ? { id: 'user-1', login_name: 'owner' } : null,
    workspace: status === 'authenticated' ? { id: 'workspace-1', name: '我的工作区' } : null,
    login: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
  }
}

function Wrapper({ children, auth }: { children: ReactNode, auth: AuthContextValue }) {
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

describe('authentication route guards', () => {
  it('redirects an unauthenticated business route to login', async () => {
    render(
      <Wrapper auth={authValue('unauthenticated')}>
        <MemoryRouter initialEntries={['/projects/project-1']}>
          <Routes>
            <Route path="/login" element={<div>登录页面</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/projects/:id" element={<div>项目页面</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    )
    expect(await screen.findByText('登录页面')).toBeInTheDocument()
    expect(screen.queryByText('项目页面')).not.toBeInTheDocument()
  })

  it('redirects an authenticated user away from login', async () => {
    render(
      <Wrapper auth={authValue('authenticated')}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<div>登录页面</div>} />
            </Route>
            <Route path="/" element={<div>项目列表</div>} />
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    )
    expect(await screen.findByText('项目列表')).toBeInTheDocument()
  })

  it('preserves a safe protected target when authentication completes', async () => {
    render(
      <Wrapper auth={authValue('authenticated')}>
        <MemoryRouter initialEntries={[{
          pathname: '/login',
          state: { from: '/projects/project-1?tab=tree' },
        }]}
        >
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<div>登录页面</div>} />
            </Route>
            <Route path="/projects/:id" element={<div>项目详情</div>} />
          </Routes>
        </MemoryRouter>
      </Wrapper>,
    )
    expect(await screen.findByText('项目详情')).toBeInTheDocument()
  })
})
