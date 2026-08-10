import {
  Check,
  Info,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { mutationMessage } from '../projects/errors'
import {
  useConfirmDraft,
  useDeleteDraftNode,
  useDiscardDraft,
  useEditDraftNode,
  useRedraftDraft,
  useRetryDraft,
  useSendDraftMessage,
  useSubmitClarify,
} from './queries'
import type { DirectoryDraft, DraftMessage, DraftNode } from './types'

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

function ChatBubble({ message }: { message: DraftMessage }) {
  if (message.role === 'system') {
    const applied = message.content.startsWith('已应用目录')
    const countMatch = message.content.match(/共 (\d+) 个节点/)
    return (
      <div className={`draft-msg draft-msg-system${applied ? ' draft-msg-applied' : ''}`}>
        {applied ? <Check size={12} /> : <Info size={12} />}
        <span>
          {applied && countMatch
            ? `已更新目录（${countMatch[1]} 个节点）`
            : message.content}
        </span>
      </div>
    )
  }
  return (
    <div className={`draft-msg draft-msg-${message.role}`}>
      <span className="draft-msg-bubble">{message.content}</span>
    </div>
  )
}

export default function DraftPanel({ projectId, draft }: DraftPanelProps) {
  const draftId = draft.id
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({})
  const [otherText, setOtherText] = useState<Record<string, string>>({})
  const [chatInput, setChatInput] = useState('')
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [redraftOpen, setRedraftOpen] = useState(false)
  const [redraftBackground, setRedraftBackground] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const chatListRef = useRef<HTMLDivElement>(null)
  const messageCount = draft.messages?.length ?? 0

  const clarifyMutation = useSubmitClarify(projectId, draftId)
  const chatMutation = useSendDraftMessage(projectId, draftId)
  const confirmMutation = useConfirmDraft(projectId, draftId)
  const discardMutation = useDiscardDraft(projectId, draftId)
  const retryMutation = useRetryDraft(projectId, draftId)
  const redraftMutation = useRedraftDraft(projectId, draftId)
  const editNodeMutation = useEditDraftNode(projectId, draftId)
  const deleteNodeMutation = useDeleteDraftNode(projectId, draftId)

  useEffect(() => {
    if (draft.status !== 'drafting') return
    setElapsed(0)
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [draft.status])

  useEffect(() => {
    const el = chatListRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messageCount, chatMutation.isPending])

  function sendChatMessage() {
    const content = chatInput.trim()
    if (!content || chatMutation.isPending) return
    void chatMutation.mutateAsync(content).then(
      () => setChatInput(''),
      () => undefined,
    )
  }

  function setSingleAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    setOtherOpen((prev) => ({ ...prev, [questionId]: false }))
  }

  function toggleMultiAnswer(
    questionId: string,
    option: string,
    checked: boolean,
  ) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] as string[] : []
      const next = checked
        ? [...current, option]
        : current.filter((item) => item !== option)
      return { ...prev, [questionId]: next }
    })
  }

  function toggleOther(questionId: string, checked: boolean) {
    setOtherOpen((prev) => ({ ...prev, [questionId]: checked }))
  }

  function buildClarifyPayload(): Record<string, string | string[]> {
    const payload: Record<string, string | string[]> = {}
    for (const question of draft.clarify) {
      const answer = answers[question.id]
      const custom = (otherText[question.id] ?? '').trim()
      if (question.multiple) {
        const selected = Array.isArray(answer) ? [...answer] : []
        if (otherOpen[question.id]) selected.push(custom || '其他')
        payload[question.id] = selected
      } else if (answer === '__other__' || otherOpen[question.id]) {
        payload[question.id] = custom || '其他'
      } else if (typeof answer === 'string' && answer) {
        payload[question.id] = answer
      } else {
        payload[question.id] = ''
      }
    }
    return payload
  }

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
      <div key={node.id} className="draft-node">
        <div className="draft-node-row" style={{ paddingLeft: `${8 + (depth - 1) * 18}px` }}>
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
        </div>
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
                    {question.multiple ? (
                      <input
                        type="checkbox"
                        checked={
                          Array.isArray(answers[question.id])
                          && (answers[question.id] as string[]).includes(option)
                        }
                        onChange={(event) =>
                          toggleMultiAnswer(question.id, option, event.target.checked)
                        }
                      />
                    ) : (
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        checked={answers[question.id] === option}
                        onChange={() => setSingleAnswer(question.id, option)}
                      />
                    )}
                    <span>{option}</span>
                  </label>
                ))}
                <label className="draft-option">
                  {question.multiple ? (
                    <input
                      type="checkbox"
                      checked={Boolean(otherOpen[question.id])}
                      onChange={(event) => toggleOther(question.id, event.target.checked)}
                    />
                  ) : (
                    <input
                      type="radio"
                      name={`q-${question.id}`}
                      checked={Boolean(otherOpen[question.id])}
                      onChange={() => {
                        setOtherOpen((prev) => ({ ...prev, [question.id]: true }))
                        setAnswers((prev) => ({ ...prev, [question.id]: '__other__' }))
                      }}
                    />
                  )}
                  <span>其他</span>
                </label>
                {otherOpen[question.id] && (
                  <input
                    className="draft-question-text"
                    placeholder="请输入自定义内容"
                    aria-label={`补充 ${question.text}`}
                    value={otherText[question.id] ?? ''}
                    onChange={(event) =>
                      setOtherText((prev) => ({
                        ...prev,
                        [question.id]: event.target.value,
                      }))
                    }
                  />
                )}
              </div>
            ) : (
              <input
                className="draft-question-text"
                value={typeof answers[question.id] === 'string' ? answers[question.id] as string : ''}
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
            onClick={() => void clarifyMutation.mutateAsync(buildClarifyPayload())}
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
        <div className="draft-chat-layout">
          <div className="draft-tree-pane">
            <header className="draft-step-head">
              <Sparkles size={16} />
              <strong>AI 目录草稿</strong>
              <span>{draft.nodes.length} 个节点</span>
            </header>
            <div className="draft-tree">
              {childrenMap.get(null)?.map((node) => renderNode(node))}
            </div>
          </div>
          <div className="draft-chat">
            <header className="draft-chat-head">
              <MessageSquare size={14} />
              <strong>与 AI 调整目录</strong>
              <span>{(draft.messages ?? []).filter((m) => m.role === 'user').length}/30 轮</span>
            </header>
            <div className="draft-chat-list" ref={chatListRef}>
              {(draft.messages ?? []).map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
              {chatMutation.isPending && (
                <div className="draft-msg draft-msg-user draft-msg-pending">
                  <span className="draft-msg-bubble">{chatInput.trim()}</span>
                  <Loader2 size={13} className="spin" />
                </div>
              )}
            </div>
            {chatMutation.isError && (
              <p className="draft-error" role="alert">
                {mutationMessage(chatMutation.error, '发送失败，请重试')}
              </p>
            )}
            <div className="draft-chat-input-row">
              <textarea
                className="draft-chat-input"
                value={chatInput}
                placeholder="和 AI 讨论目录，确定后发送，例如：把名称缩短；增加一个收纳节点"
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    sendChatMessage()
                  }
                }}
                disabled={chatMutation.isPending}
              />
              <button
                type="button"
                className="btn primary draft-chat-send"
                disabled={!chatInput.trim() || chatMutation.isPending}
                onClick={sendChatMessage}
              >
                {chatMutation.isPending ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Send size={14} />
                )}
                发送
              </button>
            </div>
          </div>
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
          <span>AI 正在生成目录草稿…（已等待 {elapsed} 秒）</span>
          {elapsed >= 20 && (
            <span className="draft-slow-hint">
              真实 AI 生成通常需要几十秒到几分钟，请耐心等待。
            </span>
          )}
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

      {(
        draft.status === 'drafting'
        || draft.status === 'awaiting_input'
        || draft.status === 'pending_confirm'
        || draft.status === 'failed'
      ) && (
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
