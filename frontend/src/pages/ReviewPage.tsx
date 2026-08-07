import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useToast } from '../components/useToast'
import { entryTypeLabels, sourceTypeLabels } from '../inbox/labels'
import type { EntryType, SourceType } from '../inbox/types'
import { useReviewFindings, useReviewMutations } from '../review/queries'
import type {
  ReviewFinding,
  ReviewFindingType,
  ReviewStatus,
} from '../review/types'

const findingTypeLabels: Record<ReviewFindingType, string> = {
  missing_source: '缺来源',
  missing_conditions: '缺适用条件',
  long_pending: '长期待确认',
}

const findingTypeOptions: Array<[ReviewFindingType | 'all', string]> = [
  ['all', '全部'],
  ['missing_source', '缺来源'],
  ['missing_conditions', '缺适用条件'],
  ['long_pending', '长期待确认'],
]

function findingKey(item: ReviewFinding): string {
  return `${item.finding_type}:${item.target_type}:${item.target_id}`
}

function formatTime(value: string | null | undefined): string {
  return value ? dayjs(value).format('MM-DD HH:mm') : ''
}

export default function ReviewPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [status, setStatus] = useState<ReviewStatus>('open')
  const [findingType, setFindingType] = useState<ReviewFindingType | 'all'>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const { setResolution, undoResolution } = useReviewMutations()

  const query = useReviewFindings(status, findingType)
  const findings = query.data?.findings ?? []
  const mutating = setResolution.isPending || undoResolution.isPending

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function updateNote(key: string, value: string) {
    setNotes((prev) => ({ ...prev, [key]: value }))
  }

  async function handleResolve(item: ReviewFinding) {
    const key = findingKey(item)
    try {
      await setResolution.mutateAsync({
        target: {
          findingType: item.finding_type,
          targetType: item.target_type,
          targetId: item.target_id,
        },
        input: {
          resolution: 'resolved',
          note: notes[key]?.trim() || undefined,
        },
      })
      toast.success('已标记为已解决')
      updateNote(key, '')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败，请重试')
    }
  }

  async function handleIgnore(item: ReviewFinding) {
    const key = findingKey(item)
    try {
      await setResolution.mutateAsync({
        target: {
          findingType: item.finding_type,
          targetType: item.target_type,
          targetId: item.target_id,
        },
        input: {
          resolution: 'ignored',
          note: notes[key]?.trim() || undefined,
        },
      })
      toast.success('已忽略该问题')
      updateNote(key, '')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败，请重试')
    }
  }

  async function handleUndo(item: ReviewFinding) {
    try {
      await undoResolution.mutateAsync({
        findingType: item.finding_type,
        targetType: item.target_type,
        targetId: item.target_id,
      })
      toast.success('已撤销处理，问题回到待处理')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败，请重试')
    }
  }

  return (
    <div className="projects-page review-page">
      <header className="page-toolbar">
        <h1>Review</h1>
      </header>

      <div className="review-tabs" role="tablist" aria-label="Review 视图">
        <button
          type="button"
          role="tab"
          aria-selected={status === 'open'}
          className={`review-tab${status === 'open' ? ' active' : ''}`}
          onClick={() => setStatus('open')}
        >
          待处理
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={status === 'resolved'}
          className={`review-tab${status === 'resolved' ? ' active' : ''}`}
          onClick={() => setStatus('resolved')}
        >
          已处理
        </button>
      </div>

      <div className="review-filters" aria-label="问题类型筛选">
        {findingTypeOptions.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`review-filter-chip${findingType === value ? ' active' : ''}`}
            onClick={() => setFindingType(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isPending && (
        <div className="state-panel" role="status">
          <span className="spin state-spinner" />
          正在加载问题
        </div>
      )}

      {query.isError && (
        <div className="state-panel state-error" role="alert">
          <strong>加载失败</strong>
          <span>{query.error instanceof Error ? query.error.message : '请检查连接后重试'}</span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={16} />
            重试
          </button>
        </div>
      )}

      {query.isSuccess && findings.length === 0 && (
        <div className="state-panel" role="status">
          <strong>{status === 'open' ? '没有待处理问题' : '还没有处理记录'}</strong>
          <span>
            {status === 'open'
              ? '知识库的缺来源、缺适用条件与长期待确认检查均通过'
              : '处理过的问题会显示在这里，可随时撤销'}
          </span>
        </div>
      )}

      {query.isSuccess && findings.length > 0 && (
        <div className="review-list">
          {findings.map((item) => {
            const key = findingKey(item)
            const isExpanded = Boolean(expanded[key])
            const entryJump =
              item.target_type === 'entry'
                ? item.node_id
                  ? `/projects/${item.project_id}/nodes/${item.node_id}`
                  : item.project_id
                    ? `/projects/${item.project_id}`
                    : null
                : null
            return (
              <article key={key} className="review-card">
                <header className="review-card-head">
                  <span className="badge">{findingTypeLabels[item.finding_type]}</span>
                  <h3>{item.title}</h3>
                  <span className="review-card-time">
                    {formatTime(status === 'open' ? item.created_at : item.resolved_at)}
                  </span>
                </header>
                <p className="review-card-summary">{item.summary}</p>
                {status === 'resolved' && item.resolution && (
                  <p className="review-card-resolution">
                    {item.resolution === 'resolved' ? '已解决' : '已忽略'}
                    {item.note ? `：${item.note}` : ''}
                  </p>
                )}
                <div className="review-card-actions">
                  <button type="button" className="btn small" onClick={() => toggle(key)}>
                    {isExpanded ? '收起详情' : '查看详情'}
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {status === 'open' ? (
                    <>
                      <button
                        type="button"
                        className="btn small primary"
                        disabled={mutating}
                        onClick={() => void handleResolve(item)}
                      >
                        标记已解决
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        disabled={mutating}
                        onClick={() => void handleIgnore(item)}
                      >
                        忽略
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn small"
                      disabled={mutating}
                      onClick={() => void handleUndo(item)}
                    >
                      <Undo2 size={14} />
                      撤销
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="review-detail">
                    {item.target_type === 'entry' ? (
                      <>
                        <div className="review-detail-row">
                          <span>记录类型</span>
                          <strong>
                            {entryTypeLabels[item.entry_type as EntryType] ?? item.entry_type}
                          </strong>
                        </div>
                        <div className="review-detail-row">
                          <span>内容</span>
                          <p>{item.content}</p>
                        </div>
                        <div className="review-detail-row">
                          <span>适用条件</span>
                          <p>
                            {item.conditions && item.conditions.length > 0
                              ? item.conditions.join('；')
                              : '（无）'}
                          </p>
                        </div>
                        <div className="review-detail-row">
                          <span>路径</span>
                          <strong>
                            {item.project_name}
                            {item.node_path && item.node_path.length > 0
                              ? ` / ${item.node_path.join(' / ')}`
                              : ''}
                          </strong>
                        </div>
                        {entryJump && (
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => navigate(entryJump)}
                          >
                            查看记录
                            <ExternalLink size={13} />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="review-detail-row">
                          <span>来源类型</span>
                          <strong>
                            {sourceTypeLabels[item.source_type as SourceType] ?? item.source_type}
                          </strong>
                        </div>
                        <div className="review-detail-row">
                          <span>原文</span>
                          <p>{item.content ?? item.link_url ?? '（无正文）'}</p>
                        </div>
                        <div className="review-detail-row">
                          <span>待确认</span>
                          <strong>{item.pending_count ?? 0} 条</strong>
                        </div>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => navigate(`/inbox/${item.target_id}`)}
                        >
                          去确认
                          <ExternalLink size={13} />
                        </button>
                      </>
                    )}

                    {status === 'open' && (
                      <div className="review-detail-actions">
                        <input
                          value={notes[key] ?? ''}
                          onChange={(event) => updateNote(key, event.target.value)}
                          placeholder="备注（可选）"
                          aria-label={`备注：${item.title}`}
                        />
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
