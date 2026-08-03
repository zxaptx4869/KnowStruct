import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { safeReturnPath } from '../auth/navigation'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/api'

interface LocationState {
  from?: unknown
}

export default function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    if (!account.trim() || !password) {
      setError('请输入账号和密码')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await auth.login({ account, password, remember_me: rememberMe })
      const state = location.state as LocationState | null
      navigate(safeReturnPath(state?.from), { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
      } else {
        setError('登录失败，请稍后重试')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-lockup"><span className="brand-mark">KS</span><span>KnowStruct</span></div>
        <div className="login-heading">
          <h1 id="login-title">登录 KnowStruct</h1>
          <p>使用已有账号进入你的项目和知识目录。</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label className="form-field">
            <span>账号</span>
            <input
              autoComplete="username"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              placeholder="请输入账号"
              aria-invalid={Boolean(error) && !account.trim()}
            />
          </label>
          <label className="form-field">
            <span>密码</span>
            <span className="password-input">
              <input
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                aria-invalid={Boolean(error) && !password}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? '隐藏密码' : '显示密码'}
                title={passwordVisible ? '隐藏密码' : '显示密码'}
              >
                {passwordVisible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </span>
          </label>
          <label className="remember-option">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>保持登录</span>
          </label>

          {error && <div className="login-error" role="alert">{error}</div>}

          <button className="primary-button login-button" type="submit" disabled={submitting}>
            {submitting && <LoaderCircle className="spin" size={18} aria-hidden="true" />}
            {submitting ? '登录中' : '登录'}
          </button>
        </form>

        <p className="login-boundary">当前版本仅支持已有账号登录，不提供用户注册或找回密码。</p>
      </section>
    </main>
  )
}
