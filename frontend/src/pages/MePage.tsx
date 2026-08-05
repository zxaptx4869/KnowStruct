import { LogOut, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  useAiConfig,
  useDeleteAiConfig,
  useSaveAiConfig,
} from '../inbox/queries'
import type { AiConfigUpdate } from '../inbox/types'
import { mutationMessage } from '../projects/errors'

function AiProviderConfigSection() {
  const aiConfigQuery = useAiConfig()
  const saveMutation = useSaveAiConfig()
  const deleteMutation = useDeleteAiConfig()
  const [provider, setProvider] = useState<'deepseek' | 'doubao'>('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const config = aiConfigQuery.data

  useEffect(() => {
    if (!config) return
    if (config.provider === 'deepseek' || config.provider === 'doubao') {
      setProvider(config.provider)
    }
    setBaseUrl(config.base_url ?? '')
    setModel(config.model ?? '')
  }, [config])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    const payload: AiConfigUpdate = { provider }
    if (apiKey.trim()) payload.api_key = apiKey.trim()
    if (baseUrl.trim()) payload.base_url = baseUrl.trim()
    if (model.trim()) payload.model = model.trim()
    try {
      const saved = await saveMutation.mutateAsync(payload)
      setApiKey('')
      setMessage(
        `已保存 ${saved.provider} 配置，当前 Key：${saved.api_key_masked || '未提供'}`,
      )
    } catch (catchError) {
      setError(mutationMessage(catchError, '保存失败，请重试'))
    }
  }

  async function handleDelete() {
    setError(null)
    setMessage(null)
    try {
      await deleteMutation.mutateAsync()
      setApiKey('')
      setMessage('已删除自定义配置，之后将使用部署环境变量。')
    } catch (catchError) {
      setError(mutationMessage(catchError, '删除失败，请重试'))
    }
  }

  return (
    <section className="ai-config-panel">
      <div className="section-heading">
        <span className="badge">AI</span>
        <strong>AI 服务配置</strong>
      </div>
      <p className="field-hint">
        用于文字 / 图片的 AI 提取。配置后优先使用你的 Key；未配置时使用部署环境变量。
      </p>
      <form className="capture-form" onSubmit={handleSave}>
        <div className="form-field">
          <span>提供商</span>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as 'deepseek' | 'doubao')}
          >
            <option value="deepseek">DeepSeek</option>
            <option value="doubao">豆包（火山方舟）</option>
          </select>
        </div>
        <div className="form-field">
          <span>API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              config?.api_key_masked
                ? `当前：${config.api_key_masked}（留空表示不修改）`
                : '输入 API Key'
            }
            autoComplete="off"
          />
        </div>
        <div className="form-field">
          <span>Base URL（可选）</span>
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="默认使用提供商官方地址"
          />
        </div>
        <div className="form-field">
          <span>模型（可选）</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="默认使用提供商推荐模型"
          />
        </div>
        {error && <div className="inline-error" role="alert">{error}</div>}
        {message && <div className="success-box" role="status">{message}</div>}
        <div className="ai-config-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? '保存中…' : '保存配置'}
          </button>
          {config?.api_key_masked && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleDelete()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? '删除中…' : '删除配置'}
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

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
      <AiProviderConfigSection />
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="secondary-button logout-wide" type="button" onClick={handleLogout} disabled={submitting}>
        <LogOut size={18} aria-hidden="true" />
        {submitting ? '正在退出' : '退出登录'}
      </button>
    </div>
  )
}
