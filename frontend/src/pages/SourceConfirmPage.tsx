import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../components/useToast'
import {
  entryTypeOptions,
  processingDetailLabel,
  sourceTypeLabels,
} from '../inbox/labels'
import {
  useDecideExtraction,
  useRetrySource,
  useSourceDetail,
} from '../inbox/queries'
import type { DecideInput, Extraction, SourceDetail } from '../inbox/types'
import { mutationMessage } from '../projects/errors'
import { useNodes, useProjects } from '../projects/queries'

function confidenceBadge(confidence: number | null) {
  if (confidence === null) return null
  const low = confidence < 0.7
  return (
    <span className={`candidate-confidence${low ? ' low' : ''}`}>
      {low ? `低置信度 ${Math.round(confidence * 100)}%` : `置信度 ${Math.round(confidence * 100)}%`}
    </span>
  )
}

function CandidateCard({
  sourceId,
  extraction,
  projectId,
  onProjectNeeded,
}: {
  sourceId: string
  extraction: Extraction
  projectId: string
  onProjectNeeded: () => void
}) {
  const [title, setTitle] = useState(extraction.title)
  const [content, setContent] = useState(extraction.content)
  const [entryType, setEntryType] = useState(extraction.entry_type)
  const [conditions, setConditions] = useState(
    (extraction.applicable_conditions ?? []).join('；'),
  )
  const [nodeId, setNodeId] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const decideMutation = useDecideExtraction(sourceId)
  const nodesQuery = useNodes(projectId)

  const decided = extraction.status !== 'pending_confirm'

  function buildInput(decision: 'accepted' | 'rejected'): DecideInput {
    return {
      decision,
      project_id: projectId || undefined,
      node_id: nodeId || undefined,
      title,
      content,
      entry_type: entryType as DecideInput['entry_type'],
      applicable_conditions: conditions
        .split(/[；;]/)
        .map((item) => item.trim())
        .filter(Boolean),
    }
  }

  async function submit(decision: 'accepted' | 'rejected') {
    setActionError(null)
    if (decision === 'accepted' && !projectId) {
      onProjectNeeded()
      return
    }
    try {
      await decideMutation.mutateAsync({ extractionId: extraction.id, input: buildInput(decision) })
    } catch (error) {
      setActionError(mutationMessage(error, '提交失败，请重试'))
    }
  }

  return (
    <article className={`candidate-card${decided ? ` decided-${extraction.status}` : ''}`}>
      <header className="candidate-head">
        <h3>{extraction.title}</h3>
        {confidenceBadge(extraction.confidence)}
        {decided && (
          <span className={`decision-badge ${extraction.status}`}>
            {extraction.status === 'accepted' ? '已接受' : '已拒绝'}
          </span>
        )}
      </header>

      <div className="candidate-form">
        <div className="form-field">
          <span>记录标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={decided} />
        </div>
        <div className="form-field">
          <span>记录类型</span>
          <select value={entryType} onChange={(event) => setEntryType(event.target.value)} disabled={decided}>
            {entryTypeOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <span>候选内容</span>
          <textarea rows={4} value={content} onChange={(event) => setContent(event.target.value)} disabled={decided} />
        </div>
        <div className="form-field">
          <span>适用条件</span>
          <input
            value={conditions}
            onChange={(event) => setConditions(event.target.value)}
            placeholder="用分号分隔多条条件"
            disabled={decided}
          />
        </div>
        <div className="form-field">
          <span>归档节点（可选）</span>
          <select value={nodeId} onChange={(event) => setNodeId(event.target.value)} disabled={decided}>
            <option value="">暂不归档</option>
            {(nodesQuery.data ?? []).map((node) => (
              <option key={node.id} value={node.id}>{node.name}</option>
            ))}
          </select>
          {extraction.suggested_node_path && (
            <small className="field-hint">AI 建议：{extraction.suggested_node_path}</small>
          )}
        </div>
        {!projectId && (
          <div className="object-note">接受前必须确认项目；AI 不会替你决定归属。</div>
        )}
        {actionError && <div className="inline-error" role="alert">{actionError}</div>}
      </div>

      {!decided && (
        <footer className="candidate-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void submit('rejected')}
            disabled={decideMutation.isPending}
          >
            拒绝
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void submit('accepted')}
            disabled={decideMutation.isPending}
          >
            {decideMutation.isPending ? '提交中…' : '接受并生成正式记录'}
          </button>
        </footer>
      )}
      {decided && extraction.status === 'accepted' && (
        <p className="decision-note">已生成正式记录，并保留原始 Source 关联。</p>
      )}
    </article>
  )
}

function SourcePane({ source }: { source: SourceDetail }) {
  const retryMutation = useRetrySource(source.id)
  const failed = source.processing_state === 'failed'
  const stageLabels: Record<string, string> = {
    ocr: '图片识别',
    ai_extraction: 'AI 提取',
  }
  const attachmentItems = source.attachments?.length
    ? source.attachments
    : source.attachment
      ? [source.attachment]
      : []
  return (
    <aside className="source-pane">
      <div className="section-heading">
        <span className="badge">Source</span>
        <strong>{sourceTypeLabels[source.source_type]}原始来源</strong>
      </div>
      <div className="source-title">{source.title}</div>
      {source.source_type === 'link' && source.link_url && (
        <a className="source-link" href={source.link_url} target="_blank" rel="noreferrer">{source.link_url}</a>
      )}
      {source.source_type === 'image' && attachmentItems.length > 0 && (
        <div className="source-attachments-strip">
          {attachmentItems.map((item) => (
            <img
              key={item.url}
              className="source-image-preview"
              src={item.url}
              alt={source.title}
            />
          ))}
        </div>
      )}
      {source.content ? (
        <p className="source-content">{source.content}</p>
      ) : (
        <p className="source-content source-empty">图片正文待识别，识别完成后自动进入 AI 提取。</p>
      )}
      <dl className="source-meta">
        <div><dt>所属项目</dt><dd>{source.project_name ?? '未分配'}</dd></div>
        <div><dt>处理状态</dt><dd>{processingDetailLabel(source)}</dd></div>
        {source.task && (
          <>
            <div><dt>处理步骤</dt><dd>{stageLabels[source.task.stage] ?? source.task.stage}</dd></div>
            <div><dt>尝试次数</dt><dd>{source.task.attempt_count}</dd></div>
          </>
        )}
      </dl>
      {failed && source.task?.last_error && (
        <div className="failure-box" role="alert">
          <strong>处理失败：</strong>{source.task.last_error}
          <button
            type="button"
            className="btn small"
            onClick={() => void retryMutation.mutateAsync()}
            disabled={retryMutation.isPending}
          >
            <RefreshCw size={13} />
            {retryMutation.isPending ? '重试中…' : '从失败步骤重试'}
          </button>
        </div>
      )}
    </aside>
  )
}

function FailedState({ source }: { source: SourceDetail }) {
  const retryMutation = useRetrySource(source.id)
  return (
    <div className="state-panel state-error" role="alert">
      <strong>处理失败</strong>
      <span>{source.task?.last_error ?? 'AI 提取失败，原始来源已保留，可重试。'}</span>
      <button
        type="button"
        className="primary-button"
        onClick={() => void retryMutation.mutateAsync()}
        disabled={retryMutation.isPending}
      >
        <RefreshCw size={16} />
        {retryMutation.isPending ? '重试中…' : '从失败步骤重试'}
      </button>
    </div>
  )
}

export default function SourceConfirmPage() {
  const { sourceId = '' } = useParams<{ sourceId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const detailQuery = useSourceDetail(sourceId)
  const projectsQuery = useProjects()
  const [projectId, setProjectId] = useState('')
  const [projectFieldError, setProjectFieldError] = useState(false)
  const [mobileIndex, setMobileIndex] = useState(0)
  const projectSelectRef = useRef<HTMLSelectElement>(null)

  const source = detailQuery.data
  const extractions = source?.extractions ?? []
  const decidedCount = extractions.filter((item) => item.status !== 'pending_confirm').length
  const allDecided = extractions.length > 0 && decidedCount === extractions.length
  const acceptedCount = extractions.filter((item) => item.status === 'accepted').length
  const rejectedCount = extractions.filter((item) => item.status === 'rejected').length
  const effectiveProjectId = projectId || source?.project_id || ''

  const nextUndecidedIndex = useMemo(() => {
    const items = source?.extractions ?? []
    if (items.length === 0) return -1
    const start = Math.min(mobileIndex + 1, items.length - 1)
    for (let offset = 0; offset < items.length; offset += 1) {
      const index = (start + offset) % items.length
      if (items[index].status === 'pending_confirm') return index
    }
    return -1
  }, [source, mobileIndex])

  function requestProjectSelection() {
    setProjectFieldError(true)
    toast.error('接受前请先选择归档项目')
    projectSelectRef.current?.focus()
  }

  return (
    <div className="projects-page confirm-page">
      <header className="page-toolbar confirm-toolbar">
        <div>
          <button type="button" className="icon-action" onClick={() => navigate('/inbox')} aria-label="返回采集箱">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>确认资料</h1>
            <p>{source ? `${source.title} · ${extractions.length} 条候选` : '正在加载…'}</p>
          </div>
        </div>
      </header>

      {source && allDecided && (
        <div className="success-box" role="status">
          已处理完成：接受 {acceptedCount} 条，拒绝 {rejectedCount} 条
        </div>
      )}

      {detailQuery.isPending && (
        <div className="state-panel" role="status"><span className="spin state-spinner" />正在加载资料</div>
      )}
      {detailQuery.isError && (
        <div className="state-panel state-error" role="alert">
          <strong>资料加载失败</strong>
          <button type="button" className="secondary-button" onClick={() => void detailQuery.refetch()}>
            <RefreshCw size={16} />重试
          </button>
        </div>
      )}
      {source && source.processing_state === 'processing' && extractions.length === 0 && (
        <div className="state-panel" role="status">
          <span className="spin state-spinner" />
          <strong>{processingDetailLabel(source)}</strong>
          <span>原始来源已保存，可以离开此页，处理完成后会自动刷新。</span>
        </div>
      )}
      {source && source.processing_state === 'failed' && extractions.length === 0 && (
        <FailedState source={source} />
      )}
      {source && extractions.length === 0 && source.processing_state === 'done' && (
        <div className="state-panel">
          <strong>暂无候选</strong>
          <span>这份资料还没有生成可确认的候选内容。</span>
        </div>
      )}
      {source && extractions.length > 0 && (
        <>
          {!allDecided && (
            <div className="confirm-object-note">
              Extraction 不是正式知识。请逐条检查类型、内容、适用条件和归档节点；接受后才生成 Entry。
            </div>
          )}
          <div className="confirm-toolbar-row">
            <div className="confirm-progress">
              <strong>确认进度 {decidedCount} / {extractions.length}</strong>
              <div className="progress-line">
                <span style={{ width: `${extractions.length ? (decidedCount / extractions.length) * 100 : 0}%` }} />
              </div>
              <span className="badge">逐条确认</span>
            </div>
            <div className="form-field compact-project-field">
              <span>归档项目（接受时必选）</span>
              <select
                ref={projectSelectRef}
                aria-label="归档项目"
                aria-invalid={projectFieldError || undefined}
                className={projectFieldError ? 'field-error' : undefined}
                value={effectiveProjectId}
                onChange={(event) => {
                  setProjectId(event.target.value)
                  setProjectFieldError(false)
                }}
              >
                <option value="">请选择项目</option>
                {(projectsQuery.data ?? []).map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="confirm-layout">
            <SourcePane source={source} />
            <section className="candidate-list" aria-label="AI 候选">
              <div className="desktop-candidates">
                {extractions.map((extraction) => (
                  <CandidateCard
                    key={extraction.id}
                    sourceId={source.id}
                    extraction={extraction}
                    projectId={effectiveProjectId}
                    onProjectNeeded={requestProjectSelection}
                  />
                ))}
              </div>
              <div className="mobile-candidates">
                <div className="mobile-candidate-nav">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setMobileIndex(Math.max(0, mobileIndex - 1))}
                    disabled={mobileIndex === 0}
                  >
                    <ChevronLeft size={15} />上一条
                  </button>
                  <span>候选 {mobileIndex + 1} / {extractions.length}</span>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      if (nextUndecidedIndex >= 0) setMobileIndex(nextUndecidedIndex)
                      else setMobileIndex(Math.min(extractions.length - 1, mobileIndex + 1))
                    }}
                    disabled={mobileIndex >= extractions.length - 1 && nextUndecidedIndex < 0}
                  >
                    {nextUndecidedIndex >= 0 ? '下一条待确认' : '下一条'}<ChevronRight size={15} />
                  </button>
                </div>
                <CandidateCard
                  key={`${extractions[mobileIndex].id}-${mobileIndex}`}
                  sourceId={source.id}
                  extraction={extractions[mobileIndex]}
                  projectId={effectiveProjectId}
                  onProjectNeeded={requestProjectSelection}
                />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
