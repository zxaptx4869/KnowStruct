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
      <button type="button" onClick={() => void auth.logout()}>退出测试</button>
    </div>
  )
}

describe('AuthProvider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('restores an authenticated session on startup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      user: { id: 'user-1', login_name: 'owner' },
      workspace: { id: 'workspace-1', name: '我的工作区' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AuthProvider><Harness /></AuthProvider>)

    expect(await screen.findByText('owner')).toBeInTheDocument()
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include' }))
  })

  it('becomes unauthenticated after a 401 and clears state on logout', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: { code: 'not_authenticated', message: '请先登录' } }, 401))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AuthProvider><Harness /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    await userEvent.click(screen.getByRole('button', { name: '退出测试' }))
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
  })
})
