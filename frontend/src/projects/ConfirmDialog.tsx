import { AlertTriangle, X } from 'lucide-react'
import { mutationMessage } from './errors'

interface Props {
  title: string
  description: string
  confirmLabel?: string
  pending: boolean
  error: unknown
  onClose: () => void
  onConfirm: () => Promise<void>
}

export default function ConfirmDialog({
  title,
  description,
  confirmLabel = '永久删除',
  pending,
  error,
  onClose,
  onConfirm,
}: Props) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-panel dialog-panel-small" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <header className="dialog-header">
          <div className="confirm-heading">
            <AlertTriangle size={20} aria-hidden="true" />
            <h2 id="confirm-title">{title}</h2>
          </div>
          <button type="button" className="icon-action" onClick={onClose} aria-label="关闭" disabled={pending}><X size={18} /></button>
        </header>
        <p className="dialog-description">{description}</p>
        {Boolean(error) && <div className="inline-error" role="alert">{mutationMessage(error, '删除失败，请重试')}</div>}
        <footer className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={pending}>取消</button>
          <button type="button" className="danger-button" onClick={() => void onConfirm()} disabled={pending}>{pending ? '删除中' : confirmLabel}</button>
        </footer>
      </section>
    </div>
  )
}
