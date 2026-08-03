import { LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function MePage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleLogout() {
    setSubmitting(true)
    setError('')
    try {
      await auth.logout()
      navigate('/login', { replace: true })
    } catch {
      setError('退出失败，请检查网络后重试')
      setSubmitting(false)
    }
  }

  return (
    <div className="page-content narrow-page">
      <div className="page-heading">
        <h1>我的</h1>
      </div>
      <section className="account-summary">
        <UserRound size={22} aria-hidden="true" />
        <div>
          <strong>{auth.user?.login_name}</strong>
          <span>{auth.workspace?.name}</span>
        </div>
      </section>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="secondary-button logout-wide" type="button" onClick={handleLogout} disabled={submitting}>
        <LogOut size={18} aria-hidden="true" />
        {submitting ? '正在退出' : '退出登录'}
      </button>
    </div>
  )
}
