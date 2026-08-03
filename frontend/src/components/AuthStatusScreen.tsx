import { LoaderCircle, RefreshCw } from 'lucide-react'

interface Props {
  error?: boolean
  onRetry?: () => void
}

export default function AuthStatusScreen({ error = false, onRetry }: Props) {
  return (
    <main className="auth-status-screen" aria-live="polite">
      <div className="brand-lockup"><span className="brand-mark">KS</span><span>KnowStruct</span></div>
      {error ? (
        <div className="auth-status-message">
          <h1>暂时无法连接</h1>
          <p>请检查服务状态后重试。</p>
          <button className="secondary-button" type="button" onClick={onRetry}>
            <RefreshCw size={17} aria-hidden="true" />
            重新连接
          </button>
        </div>
      ) : (
        <div className="auth-checking">
          <LoaderCircle className="spin" size={22} aria-hidden="true" />
          <span>正在确认登录状态</span>
        </div>
      )}
    </main>
  )
}
