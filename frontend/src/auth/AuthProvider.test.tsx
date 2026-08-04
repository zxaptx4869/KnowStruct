import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function Harness() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span>{auth.user?.login_name}</span>
      <button type="button" onClick={() => void auth.login({ account: 'next', password: 'password123', remember_me: false })}>登录测试</button>
      <button type="button" onClick={() => void auth.logout()}>退出测试</button>
    </div>
  )
}

describe('AuthProvider', () => {
  afterEach(() => vi.unstubAllGlobals())

  function renderAuth(queryClient = new QueryClient()) {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider><Harness /></AuthProvider>
      </QueryClientProvider>,
    )
    return queryClient
  }

  it('restores an authenticated session on startup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      user: { id: 'user-1', login_name: 'owner' },
      workspace: { id: 'workspace-1', name: '我的工作区' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    renderAuth()

    expect(await screen.findByText('owner')).toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include' }))
  })

  it('becomes unauthenticated after a 401 and clears state on logout', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: { code: 'not_authenticated', message: '请先登录' } }, 401))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    await userEvent.click(screen.getByRole('button', { name: '退出测试' }))
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
  })

  it('clears business query data when the authenticated workspace changes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: { code: 'not_authenticated' } }, 401))
      .mockResolvedValueOnce(jsonResponse({
        user: { id: 'user-2', login_name: 'next' },
        workspace: { id: 'workspace-2', name: '新的工作区' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    queryClient.setQueryData(['projects'], [{ id: 'project-from-previous-workspace' }])

    await userEvent.click(screen.getByRole('button', { name: '登录测试' }))

    expect(await screen.findByText('next')).toBeInTheDocument()
    expect(queryClient.getQueryData(['projects'])).toBeUndefined()
  })
})
