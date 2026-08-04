import { useMemo, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { mutationMessage } from './errors'
import { childrenOf, descendants } from './tree'
import type { Node, NodeMoveInput } from './types'

interface Props {
  node: Node
  nodes: Node[]
  pending: boolean
  error: unknown
  onClose: () => void
  onSubmit: (input: NodeMoveInput) => Promise<void>
}

export default function MoveNodeDialog({ node, nodes, pending, error, onClose, onSubmit }: Props) {
  const unavailable = useMemo(() => new Set([node.id, ...descendants(node.id, nodes).map((item) => item.id)]), [node, nodes])
  const options = nodes.filter((item) => !unavailable.has(item.id))
  const [parentId, setParentId] = useState(node.parent_id ?? '')
  const siblings = childrenOf(parentId || null, nodes).filter((item) => item.id !== node.id)
  const [position, setPosition] = useState(node.sort_order)

  async function submit(event: FormEvent) {
    event.preventDefault()
    await onSubmit({ parent_id: parentId || null, position: Math.min(position, siblings.length) })
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="move-dialog-title">
        <header className="dialog-header">
          <div><span className="dialog-kicker">{node.name}</span><h2 id="move-dialog-title">移动节点</h2></div>
          <button type="button" className="icon-action" onClick={onClose} aria-label="关闭" disabled={pending}><X size={18} /></button>
        </header>
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="form-field">
            <span>目标父节点</span>
            <select value={parentId} onChange={(event) => { setParentId(event.target.value); setPosition(0) }}>
              <option value="">项目根目录</option>
              {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>目标位置</span>
            <select value={Math.min(position, siblings.length)} onChange={(event) => setPosition(Number(event.target.value))}>
              {Array.from({ length: siblings.length + 1 }, (_, index) => (
                <option key={index} value={index}>{index === siblings.length ? '放在末尾' : `放在第 ${index + 1} 位`}</option>
              ))}
            </select>
          </label>
          {Boolean(error) && <div className="inline-error" role="alert">{mutationMessage(error, '节点移动失败，请重试')}</div>}
          <footer className="dialog-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={pending}>取消</button>
            <button type="submit" className="primary-button" disabled={pending}>{pending ? '移动中' : '移动'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
