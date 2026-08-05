import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { mutationMessage } from './errors'
import type { Node, NodeInput } from './types'

interface Props {
  node?: Node
  parentId: string | null
  parentName?: string
  pending: boolean
  error: unknown
  onClose: () => void
  onSubmit: (input: NodeInput) => Promise<void>
}

export default function NodeDialog({ node, parentId, parentName, pending, error, onClose, onSubmit }: Props) {
  const [name, setName] = useState(node?.name ?? '')
  const [validation, setValidation] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setValidation('请输入节点名称')
      return
    }
    await onSubmit({ name: name.trim(), parent_id: parentId })
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="node-dialog-title">
        <header className="dialog-header">
          <h2 id="node-dialog-title">{node ? '编辑节点' : '创建子节点'}</h2>
          <button type="button" className="icon-action" onClick={onClose} aria-label="关闭" disabled={pending}><X size={18} /></button>
        </header>
        <p className="dialog-description">{parentName ? `上级节点：${parentName}` : '上级节点：项目根目录'}</p>
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="form-field">
            <span>节点名称</span>
            <input value={name} onChange={(event) => { setName(event.target.value); setValidation('') }} maxLength={100} autoFocus />
          </label>
          {(validation || Boolean(error)) && <div className="inline-error" role="alert">{validation || mutationMessage(error, '节点保存失败，请重试')}</div>}
          <footer className="dialog-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={pending}>取消</button>
            <button type="submit" className="primary-button" disabled={pending}>{pending ? '保存中' : node ? '保存更改' : '创建节点'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
