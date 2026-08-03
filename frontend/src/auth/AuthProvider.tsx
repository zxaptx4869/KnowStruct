import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, api, setUnauthorizedHandler } from '../lib/api'
import { AuthContext } from './context'
import type { AuthContextValue, AuthSession, AuthStatus, LoginInput } from './types'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [session, setSession] = useState<AuthSession | null>(null)

  const clearSession = useCallback(() => {
    setSession(null)
    setStatus('unauthenticated')
  }, [])

  const restore = useCallback(async () => {
    setStatus('checking')
    try {
      const current = await api.get<AuthSession>('/auth/me')
      setSession(current)
      setStatus('authenticated')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession()
        return
      }
      setSession(null)
      setStatus('error')
    }
  }, [clearSession])

  useEffect(() => {
    setUnauthorizedHandler(clearSession)
    void restore()
    return () => setUnauthorizedHandler(undefined)
  }, [clearSession, restore])

  const login = useCallback(async (input: LoginInput) => {
    const current = await api.post<AuthSession>('/auth/login', input)
    setSession(current)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post<void>('/auth/logout')
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
    }
    clearSession()
  }, [clearSession])

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user: session?.user ?? null,
    workspace: session?.workspace ?? null,
    login,
    logout,
    retry: restore,
  }), [status, session, login, logout, restore])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
