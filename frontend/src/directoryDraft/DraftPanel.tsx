import {
  Check,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { mutationMessage } from '../projects/errors'
import {
  useConfirmDraft,
  useDeleteDraftNode,
  useDiscardDraft,
  useEditDraftNode,
  useRedraftDraft,
  useRetryDraft,
  useSubmitClarify,
  useSubmitRefine,
} from './queries'
import type { DirectoryDraft, DraftNode } from './types'

interface DraftPanelProps {
  projectId: string
  draft: DirectoryDraft
}

function nodeDepth(nodes: DraftNode[], node: DraftNode): number {
  const index = new Map(nodes.map((item) => [item.id, item]))
  let depth = 1
  let current = node
  const seen = new Set<string>()
  while (current.parent_id && index.has(current.parent_id)) {
    if (seen.has(current.id)) break
    seen.add(current.id)
    const parent = index.get(current.parent_id)
    if (!parent) break
    depth += 1
    current = parent
  }
  return depth
}

export default function DraftPanel({ projectId, draft }: DraftPanelProps) {
  const draftId = draft.id
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [instruction, setInstruction] = useState('')
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [redraftOpen, setRedraftOpen] = useState(false)
  const [redraftBackground, setRedraftBackground] = useState('')

  const clarifyMutation = useSubmitClarify(projectId, draftId)
  const refineMutation = useSubmitRefine(projectId, draftId)
  const confirmMutation = useConfirmDraft(projectId, draftId)
  const discardMutation = useDiscardDraft(projectId, draftId)
  const retryMutation = useRetryDraft(projectId, draftId)
  const redraftMutation = useRedraftDraft(projectId, draftId)
  const editNodeMutation = useEditDraftNode(projectId, draftId)
  const deleteNodeMutation = useDeleteDraftNode(projectId, draftId)

  const childrenMap = new Map<string | null, DraftNode[]>()
  for (const node of draft.nodes) {
    const key = node.parent_id
    childrenMap.set(key, [...(childrenMap.get(key) ?? []), node])
  }
  for (const nodes of childrenMap.values()) {
    nodes.sort((a, b) => a.sort_order - b.sort_order)
  }

  function startRename(node: DraftNode) {
    setEditingNodeId(node.id)
    setEditName(node.name)
  }

  function saveRename(nodeId: string) {
    const name = editName.trim()
    if (!name) {
      setEditingNodeId(null)
      return
    }
    void editNodeMutation.mutateAsync({ nodeId, name })
    setEditingNodeId(null)
  }

  function toggleSelected(node: DraftNode, selected: boolean) {
    void editNodeMutation.mutateAsync({ nodeId: node.id, selected })
  }

  function renderNode(node: DraftNode) {
    const depth = nodeDepth(draft.nodes, node)
    return (
      <div key={node.id} className="draft-node-row" style={{ paddingLeft: `${8 + (depth - 1) * 18}px` }}>
        <input
          type="checkbox"
          className="draft-node-check"
          aria-label={`选择 ${node.name}`}
          checked={node.selected}
          onChange={(event) => toggleSelected(node, event.target.checked)}
        />
        {editingNodeId === node.id ? (
          <input
            className="draft-node-name-input"
            value={editName}
            autoFocus
            aria-label={`修改 ${node.name} 名称`}
            onChange={(event) => setEditName(event.target.value)}
            onBlur={() => saveRename(node.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveRename(node.id)
              if (event.key === 'Escape') setEditingNodeId(null)
            }}
          />
        ) : (
          <span className="draft-node-name" title={node.description ?? undefined}>
            {node.name}
          </span>
        )}
        {node.description && (
          <span className="draft-node-desc">{node.description}</span>
        )}
        <span className="draft-node-actions">
          <button type="button" className="icon-action" aria-label={`改名 ${node.name}`} onClick={() => startRename(node)}>
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="icon-action danger-text"
            aria-label={`删除 ${node.name}`}
            onClick={() => void deleteNodeMutation.mutateAsync(node.id)}
          >
            <Trash2 size={14} />
          </button>
        </span>
        {childrenMap.get(node.id)?.map((child) => renderNode(child))}
      </div>
    )
  }

  function renderClarify() {
    return (
      <div className="draft-step">
        <header className="draft-step-head">
          <Sparkles size={16} />
          <strong>为生成更贴合的目录，先确认几点</strong>
        </header>
        <div className="draft-questions">
          {draft.clarify.map((question) => (
            <fieldset key={question.id} className="draft-question">
              <legend>{question.text}</legend>
              {question.options.length > 0 ? (
                <div className="draft-options">
                  {question.options.map((option) => (
                    <label key={option} className="draft-option">
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        checked={answers[question.id] === option}
                        onChange={() =>
                          setAnswers((prev) => ({ ...prev, [question.id]: option }))
                        }
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  className="draft-question-text"
                  value={answers[question.id] ?? ''}
                  onChange={(event) =>
                    setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
                  }
                />
              )}
            </fieldset>
          ))}
        </div>
        <div className="draft-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={clarifyMutation.isPending}
            onClick={() => void clarifyMutation.mutateAsync({})}
          >
            跳过，直接生成
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={clarifyMutation.isPending}
            onClick={() => void clarifyMutation.mutateAsync(answers)}
          >
            生成目录
          </button>
        </div>
      </div>
    )
  }

  function renderPreview() {
    return (
      <div className="draft-step">
        <header className="draft-step-head">
          <Sparkles size={16} />
          <strong>AI 目录草稿</strong>
          <span>{draft.nodes.length} 个节点</span>
        </header>
        <div className="draft-tree">
          {childrenMap.get(null)?.map((node) => renderNode(node))}
        </div>
        {draft.intent_note && (
          <p className="draft-intent">当前意图：{draft.intent_note}</p>
        )}
        <div className="draft-refine">
          <label className="draft-refine-label" htmlFor="draft-instruction">
            调整意见
          </label>
          <textarea
            id="draft-instruction"
            className="draft-refine-input"
            value={instruction}
            placeholder="例如：更侧重施工流程；去掉预算类节点"
            onChange={(event) => setInstruction(event.target.value)}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={!instruction.trim() || refineMutation.isPending}
            onClick={() => {
              void refineMutation.mutateAsync(instruction.trim())
              setInstruction('')
            }}
          >
            <RefreshCw size={14} /> 重新生成
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="draft-panel">
      <header className="draft-panel-head">
        <Sparkles size={18} />
        <strong>AI 起草目录</strong>
      </header>

      {draft.status === 'drafting' && (
        <div className="draft-step state-panel" role="status">
          <Loader2 size={18} className="spin state-spinner" />
          <span>AI 正在生成目录草稿…</span>
        </div>
      )}

      {draft.status === 'awaiting_input' && renderClarify()}

      {draft.status === 'pending_confirm' && renderPreview()}

      {draft.status === 'failed' && (
        <div className="draft-step state-panel state-error" role="alert">
          <strong>AI 起草失败</strong>
          <span>{draft.last_error ?? '生成目录失败，请重试。'}</span>
          <div className="draft-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={retryMutation.isPending}
              onClick={() => void retryMutation.mutateAsync()}
            >
              <RefreshCw size={14} /> 重试
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRedraftOpen((value) => !value)}
            >
              <RotateCcw size={14} /> 重新起草
            </button>
          </div>
        </div>
      )}

      {confirmMutation.isSuccess && (
        <div className="draft-step state-panel" role="status">
          <Check size={18} />
          <span>已创建 {confirmMutation.data.created_count} 个节点，目录已就绪。</span>
        </div>
      )}

      {redraftOpen && draft.status !== 'drafting' && (
        <div className="draft-redraft">
          <textarea
            className="draft-refine-input"
            value={redraftBackground}
            placeholder="补充背景说明（可选），将重新生成目录"
            onChange={(event) => setRedraftBackground(event.target.value)}
          />
          <div className="draft-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRedraftOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={redraftMutation.isPending}
              onClick={() => {
                void redraftMutation.mutateAsync(redraftBackground.trim() || undefined)
                setRedraftOpen(false)
              }}
            >
              确认重新起草
            </button>
          </div>
        </div>
      )}

      {(draft.status === 'pending_confirm' || draft.status === 'drafting') && (
        <footer className="draft-panel-foot">
          <button
            type="button"
            className="secondary-button"
            disabled={discardMutation.isPending}
            onClick={() => void discardMutation.mutateAsync()}
          >
            <X size={14} /> 放弃草稿
          </button>
          {draft.status === 'pending_confirm' && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRedraftOpen((value) => !value)}
            >
              <RotateCcw size={14} /> 重新起草
            </button>
          )}
          {draft.status === 'pending_confirm' && (
            <button
              type="button"
              className="btn primary"
              disabled={confirmMutation.isPending}
              onClick={() => void confirmMutation.mutateAsync()}
            >
              <Check size={14} /> 确认采用
            </button>
          )}
        </footer>
      )}

      {discardMutation.isError && (
        <p className="draft-error" role="alert">{mutationMessage(discardMutation.error, '操作失败，请重试')}</p>
      )}
      {confirmMutation.isError && (
        <p className="draft-error" role="alert">{mutationMessage(confirmMutation.error, '操作失败，请重试')}</p>
      )}
    </div>
  )
}
