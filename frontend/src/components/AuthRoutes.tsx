import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { safeReturnPath } from '../auth/navigation'
import AuthStatusScreen from './AuthStatusScreen'

export function ProtectedRoute() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'checking') return <AuthStatusScreen />
  if (auth.status === 'error') return <AuthStatusScreen error onRetry={() => void auth.retry()} />
  if (auth.status === 'unauthenticated') {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from }} />
  }
  return <Outlet />
}

export function PublicOnlyRoute() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'checking') return <AuthStatusScreen />
  if (auth.status === 'error') return <AuthStatusScreen error onRetry={() => void auth.retry()} />
  if (auth.status === 'authenticated') {
    const state = location.state as { from?: unknown } | null
    return <Navigate to={safeReturnPath(state?.from)} replace />
  }
  return <Outlet />
}
