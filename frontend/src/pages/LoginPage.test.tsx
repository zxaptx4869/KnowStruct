import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/context'
import type { AuthContextValue } from '../auth/types'
import { ApiError } from '../lib/api'
import LoginPage from './LoginPage'

const baseAuth: AuthContextValue = {
  status: 'unauthenticated',
  user: null,
  workspace: null,
  login: vi.fn(),
  logout: vi.fn(),
  retry: vi.fn(),
}

function renderLogin(auth: AuthContextValue, initialEntry: string | { pathname: string, state: unknown } = '/login') {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<div>目标页面</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('LoginPage', () => {
  it('validates required fields without sending a request', async () => {
    const login = vi.fn()
    renderLogin({ ...baseAuth, login })

    await userEvent.click(screen.getByRole('button', { name: '登录' }))

    expect(screen.getByRole('alert')).toHaveTextContent('请输入账号和密码')
    expect(login).not.toHaveBeenCalled()
  })

  it('prevents duplicate submission while login is pending', async () => {
    let resolveLogin: (() => void) | undefined
    const login = vi.fn(() => new Promise<void>((resolve) => { resolveLogin = resolve }))
    renderLogin({ ...baseAuth, login })

    await userEvent.type(screen.getByLabelText('账号'), 'owner')
    await userEvent.type(screen.getByLabelText('密码'), 'correct horse battery')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))

    const pendingButton = screen.getByRole('button', { name: '登录中' })
    expect(pendingButton).toBeDisabled()
    expect(login).toHaveBeenCalledTimes(1)
    resolveLogin?.()
  })

  it('shows the stable authentication error and keeps the account', async () => {
    const login = vi.fn().mockRejectedValue(
      new ApiError(401, 'invalid_credentials', '账号或密码错误，请重新输入'),
    )
    renderLogin({ ...baseAuth, login })

    const account = screen.getByLabelText('账号')
    await userEvent.type(account, 'owner')
    await userEvent.type(screen.getByLabelText('密码'), 'wrong but long enough')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码错误')
    expect(account).toHaveValue('owner')
  })

  it('returns to a safe internal target after login', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    renderLogin(
      { ...baseAuth, login },
      { pathname: '/login', state: { from: '/projects/project-1?tab=tree' } },
    )

    await userEvent.type(screen.getByLabelText('账号'), 'owner')
    await userEvent.type(screen.getByLabelText('密码'), 'correct horse battery')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('目标页面')).toBeInTheDocument()
  })
})
