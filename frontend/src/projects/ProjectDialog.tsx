import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { mutationMessage } from './errors'
import { projectStatuses, type Project, type ProjectInput, type ProjectStatus } from './types'

interface Props {
  project?: Project
  pending: boolean
  error: unknown
  onClose: () => void
  onSubmit: (input: ProjectInput) => Promise<void>
}

export default function ProjectDialog({ project, pending, error, onClose, onSubmit }: Props) {
  const [name, setName] = useState(project?.name ?? '')
  const [goal, setGoal] = useState(project?.goal ?? '')
  const [background, setBackground] = useState(project?.background ?? '')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'planning')
  const [validation, setValidation] = useState('')

  useEffect(() => setValidation(''), [name, goal, background])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setValidation('请输入项目名称')
      return
    }
    await onSubmit({
      name: name.trim(),
      goal: goal.trim() || null,
      background: background.trim() || null,
      status,
    })
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
        <header className="dialog-header">
          <div>
            <span className="dialog-kicker">项目</span>
            <h2 id="project-dialog-title">{project ? '编辑项目' : '创建项目'}</h2>
          </div>
          <button type="button" className="icon-action" onClick={onClose} aria-label="关闭" disabled={pending}>
            <X size={18} />
          </button>
        </header>
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="form-field">
            <span>项目名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus />
          </label>
          <label className="form-field">
            <span>项目目标</span>
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={500} rows={3} />
          </label>
          <label className="form-field">
            <span>背景</span>
            <textarea value={background} onChange={(event) => setBackground(event.target.value)} maxLength={2000} rows={4} />
          </label>
          <label className="form-field">
            <span>状态</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
              {projectStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {(validation || Boolean(error)) && (
            <div className="inline-error" role="alert">
              {validation || mutationMessage(error, '项目保存失败，请重试')}
            </div>
          )}
          <footer className="dialog-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={pending}>取消</button>
            <button type="submit" className="primary-button" disabled={pending}>{pending ? '保存中' : '保存'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
