import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Play,
  RefreshCw,
  Undo2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../components/useToast'
import { entryTypeLabels, sourceTypeLabels } from '../inbox/labels'
import type { EntryType, SourceType } from '../inbox/types'
import ScopePicker from '../review/ScopePicker'
import {
  useAiDecision,
  useRecentScans,
  useReviewFindings,
  useReviewMutations,
  useReviewScan,
  useScanCandidates,
  useStartScan,
} from '../review/queries'
import { readScope, writeScope } from '../review/scope'
import type {
  ReviewCandidate,
  ReviewFinding,
  ReviewFindingType,
  ReviewScopeSelection,
  ReviewStatus,
} from '../review/types'

const findingTypeLabels: Record<ReviewFindingType, string> = {
  missing_source: '缺来源',
  missing_conditions: '缺适用条件',
  long_pending: '长期待确认',
  duplicate: '疑似重复',
  conflict: '疑似冲突',
}

const findingTypeOptions: Array<[ReviewFindingType | 'all', string]> = [
  ['all', '全部'],
  ['missing_source', '缺来源'],
  ['missing_conditions', '缺适用条件'],
  ['long_pending', '长期待确认'],
  ['duplicate', '疑似重复'],
  ['conflict', '疑似冲突'],
]

const severityLabels: Record<string, string> = {
  info: '提示',
  warning: '警告',
  error: '严重',
}

function findingKey(item: ReviewFinding): string {
  return `${item.finding_type}:${item.target_type}:${item.target_id}`
}

function formatTime(value: string | null | undefined): string {
  return value ? dayjs(value).format('MM-DD HH:mm') : ''
}

function formatElapsedMinutes(value: string | null | undefined): number {
  if (!value) return 0
  return Math.max(0, Math.floor(dayjs().diff(dayjs(value), 'minute')))
}

function entryJumpPath(
  projectId?: string | null,
  nodeId?: string | null,
): string | null {
  if (!projectId) return null
  return nodeId
    ? `/projects/${projectId}/nodes/${nodeId}`
    : `/projects/${projectId}`
}

export default function ReviewPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const initialScope = readScope(userId)
  const [status, setStatus] = useState<ReviewStatus>('open')
  const [findingType, setFindingType] = useState<ReviewFindingType | 'all'>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [scope, setScope] = useState<ReviewScopeSelection>({
    project_id: initialScope.project_id ?? null,
    node_id: initialScope.node_id ?? null,
  })
  const [activeScanId, setActiveScanId] = useState<string | null>(null)
  const { setResolution, undoResolution } = useReviewMutations()
  const startScan = useStartScan()
  const scanQuery = useReviewScan(activeScanId)
  const candidatesQuery = useScanCandidates(
    activeScanId,
    scanQuery.data?.status === 'succeeded',
  )
  const aiDecision = useAiDecision()
  const recentScansQuery = useRecentScans()
  const recentScans = recentScansQuery.data?.scans ?? []
  const latestScanId = recentScans[0]?.id

  const query = useReviewFindings(status, findingType)
  const findings = query.data?.findings ?? []
  const candidates = candidatesQuery.data?.candidates ?? []
  const mutating = setResolution.isPending || undoResolution.isPending
  const scan = scanQuery.data
  const scanActive =
    scan?.status === 'pending' || scan?.status === 'running'

  useEffect(() => {
    if (!activeScanId && latestScanId) {
      setActiveScanId(latestScanId)
    }
  }, [activeScanId, latestScanId])

  function handleScopeChange(next: ReviewScopeSelection) {
    setScope(next)
    writeScope(userId, next)
  }

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

  async function handleStartScan() {
    if (!scope.project_id) {
      toast.error('请选择审查范围')
      return
    }
    try {
      const scan = await startScan.mutateAsync({
        project_id: scope.project_id,
        node_id: scope.node_id,
      })
      setActiveScanId(scan.id)
      toast.success('已开始审查')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发起扫描失败，请重试')
    }
  }

  async function handleCandidateDecision(
    candidate: ReviewCandidate,
    decision: 'confirmed' | 'rejected',
  ) {
    try {
      await aiDecision.mutateAsync({ findingId: candidate.id, decision })
      toast.success(
        decision === 'confirmed'
          ? '已确认为问题，进入待处理'
          : '已拒绝该发现',
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败，请重试')
    }
  }

  return (
    <div className="projects-page review-page">
      <header className="page-toolbar">
        <h1>Review</h1>
      </header>

      <div className="review-scan-bar">
        <ScopePicker value={scope} onChange={handleScopeChange} />
        <button
          type="button"
          className="btn primary review-start-scan"
          disabled={startScan.isPending || scanActive}
          onClick={() => void handleStartScan()}
        >
          <Play size={14} />
          {scanActive ? '扫描中' : '开始审查'}
        </button>
      </div>

      {scan && (
        <div
          className={`state-panel review-scan-status${scan.status === 'failed' ? ' state-error' : ''}`}
          role="status"
        >
          {scanActive ? (
            <>
              <span className="spin state-spinner" />
              正在扫描该范围（开始于{' '}
              {formatTime(scan.started_at ?? scan.created_at)}，已用时{' '}
              {formatElapsedMinutes(scan.started_at ?? scan.created_at)}{' '}
              分钟），完成后将展示候选发现
            </>
          ) : scan.status === 'failed' ? (
            <>
              <strong>扫描失败</strong>
              <span>{scan.last_error ?? '请重试'}</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleStartScan()}
              >
                <RefreshCw size={16} />
                重新扫描
              </button>
            </>
          ) : (
            <span>
              扫描完成：发现 {scan.findings_count} 条候选
              {scan.truncated ? '（本次达到上限，建议缩小范围后重扫）' : ''}
            </span>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <section className="review-candidates">
          <header className="review-section-head">
            <h2>候选发现</h2>
            <span>{candidates.length} 条，需逐条确认</span>
          </header>
          <div className="review-list">
            {candidates.map((candidate) => (
              <article key={candidate.id} className="review-card">
                <header className="review-card-head">
                  <span className="badge">
                    {findingTypeLabels[candidate.review_type]}
                  </span>
                  <h3>
                    {candidate.entry_a.title} vs {candidate.entry_b.title}
                  </h3>
                  <span className={`review-severity severity-${candidate.severity}`}>
                    {severityLabels[candidate.severity] ?? candidate.severity}
                  </span>
                </header>
                <p className="review-card-summary">{candidate.description}</p>
                {candidate.suggestion && (
                  <p className="review-candidate-suggestion">
                    建议：{candidate.suggestion}
                  </p>
                )}
                <div className="review-card-actions">
                  <button
                    type="button"
                    className="btn small primary"
                    disabled={aiDecision.isPending}
                    onClick={() => void handleCandidateDecision(candidate, 'confirmed')}
                  >
                    确认为问题
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    disabled={aiDecision.isPending}
                    onClick={() => void handleCandidateDecision(candidate, 'rejected')}
                  >
                    拒绝
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

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
              ? '知识库的缺来源、缺适用条件、长期待确认与 AI 审查检查均通过'
              : '处理过的问题会显示在这里，可随时撤销'}
          </span>
        </div>
      )}

      {query.isSuccess && findings.length > 0 && (
        <div className="review-list">
          {findings.map((item) => {
            const key = findingKey(item)
            const isExpanded = Boolean(expanded[key])
            const isAiFinding = item.target_type === 'ai_finding'
            const entryAJump = isAiFinding
              ? entryJumpPath(item.project_id, item.node_id)
              : entryJumpPath(item.project_id, item.node_id)
            const entryBJump = entryJumpPath(
              item.entry_b_project_id,
              item.entry_b_node_id,
            )
            return (
              <article key={key} className="review-card">
                <header className="review-card-head">
                  <span className="badge">{findingTypeLabels[item.finding_type]}</span>
                  <h3>{item.title}</h3>
                  {item.ai_severity && (
                    <span className={`review-severity severity-${item.ai_severity}`}>
                      {severityLabels[item.ai_severity] ?? item.ai_severity}
                    </span>
                  )}
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
                    {isAiFinding ? (
                      <>
                        <div className="review-detail-row">
                          <span>AI 说明</span>
                          <p>{item.ai_description ?? item.summary}</p>
                        </div>
                        {item.ai_suggestion && (
                          <div className="review-detail-row">
                            <span>建议</span>
                            <p>{item.ai_suggestion}</p>
                          </div>
                        )}
                        <div className="review-detail-row">
                          <span>记录 A</span>
                          <p>
                            {item.title.split(' vs ')[0]}
                            {'\n'}
                            {item.content}
                          </p>
                        </div>
                        {entryAJump && (
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => navigate(entryAJump)}
                          >
                            查看记录 A
                            <ExternalLink size={13} />
                          </button>
                        )}
                        <div className="review-detail-row">
                          <span>记录 B</span>
                          <p>
                            {item.entry_b_title ?? ''}
                            {'\n'}
                            {item.entry_b_content ?? ''}
                          </p>
                        </div>
                        {entryBJump && (
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => navigate(entryBJump)}
                          >
                            查看记录 B
                            <ExternalLink size={13} />
                          </button>
                        )}
                      </>
                    ) : item.target_type === 'entry' ? (
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
                        {entryAJump && (
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => navigate(entryAJump)}
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
