import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Play,
  RefreshCw,
  Undo2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useAuth } from '../auth/useAuth'
import { useToast } from '../components/useToast'
import { entryTypeLabels, sourceTypeLabels } from '../inbox/labels'
import type { EntryType, SourceType } from '../inbox/types'
import ScopePicker from '../review/ScopePicker'
import {
  reviewKeys,
  useRecentScans,
  useReviewFindings,
  useReviewMutations,
  useReviewScan,
  useScanHistory,
  useStartScan,
} from '../review/queries'
import { readScope, writeScope } from '../review/scope'
import type {
  ReviewFinding,
  ReviewFindingType,
  ReviewScopeSelection,
  ReviewScan,
} from '../review/types'

const findingTypeLabels: Record<ReviewFindingType, string> = {
  missing_source: '缺来源',
  missing_conditions: '缺适用条件',
  duplicate: '疑似重复',
  conflict: '疑似冲突',
}

const findingTypeOptions: Array<[ReviewFindingType | 'all', string]> = [
  ['all', '全部'],
  ['missing_source', '缺来源'],
  ['missing_conditions', '缺适用条件'],
  ['duplicate', '疑似重复'],
  ['conflict', '疑似冲突'],
]

const scanStatusLabels: Record<string, string> = {
  pending: '等待中',
  running: '进行中',
  succeeded: '成功',
  failed: '失败',
}

type ReviewTab = 'open' | 'resolved' | 'rejected' | 'history'

const tabOptions: Array<[ReviewTab, string]> = [
  ['open', '待处理'],
  ['resolved', '已处理'],
  ['rejected', '已拒绝'],
  ['history', '审查记录'],
]

function findingKey(item: ReviewFinding): string {
  return `${item.finding_type}:${item.target_type}:${item.target_id}`
}

function formatTime(value: string | null | undefined): string {
  return value ? dayjs(value).format('MM-DD HH:mm:ss') : '—'
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分 ${seconds % 60} 秒`
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

function FindingDetail({
  item,
  onNavigate,
}: {
  item: ReviewFinding
  onNavigate: (path: string) => void
}) {
  const isAiFinding = item.target_type === 'ai_finding'
  const entryAJump = entryJumpPath(item.project_id, item.node_id)
  const entryBJump = entryJumpPath(
    item.entry_b_project_id,
    item.entry_b_node_id,
  )

  if (isAiFinding) {
    return (
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
            onClick={() => onNavigate(entryAJump)}
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
            onClick={() => onNavigate(entryBJump)}
          >
            查看记录 B
            <ExternalLink size={13} />
          </button>
        )}
      </>
    )
  }
  if (item.target_type === 'entry') {
    return (
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
            onClick={() => onNavigate(entryAJump)}
          >
            查看记录
            <ExternalLink size={13} />
          </button>
        )}
      </>
    )
  }
  return (
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
    </>
  )
}

export default function ReviewPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const initialScope = readScope(userId)
  const [tab, setTab] = useState<ReviewTab>('open')
  const [findingType, setFindingType] = useState<ReviewFindingType | 'all'>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [scope, setScope] = useState<ReviewScopeSelection>({
    project_id: initialScope.project_id ?? null,
    node_id: initialScope.node_id ?? null,
  })
  const [activeScanId, setActiveScanId] = useState<string | null>(null)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [expandedScans, setExpandedScans] = useState<Record<string, boolean>>({})
  const [historyItems, setHistoryItems] = useState<ReviewScan[]>([])
  const { setResolution, undoResolution } = useReviewMutations()
  const startScan = useStartScan()
  const scanQuery = useReviewScan(activeScanId)
  const recentScansQuery = useRecentScans()
  const recentScans = recentScansQuery.data?.scans ?? []
  const latestScanId = recentScans[0]?.id
  const historyQuery = useScanHistory(historyOffset)

  useEffect(() => {
    if (!historyQuery.isSuccess) return
    setHistoryItems((prev) => {
      const known = new Set(prev.map((item) => item.id))
      const incoming = historyQuery.data.scans.filter(
        (item) => !known.has(item.id),
      )
      return historyOffset === 0
        ? historyQuery.data.scans
        : [...prev, ...incoming]
    })
  }, [historyQuery.data, historyQuery.isSuccess, historyOffset])

  const findingsQuery = useReviewFindings(
    tab === 'history' ? 'open' : tab,
    findingType,
  )
  const findings = findingsQuery.data?.findings ?? []
  const scan = scanQuery.data
  const scanActive = scan?.status === 'pending' || scan?.status === 'running'
  const mutating = setResolution.isPending || undoResolution.isPending
  const prevScanStatusRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeScanId && latestScanId) {
      setActiveScanId(latestScanId)
    }
  }, [activeScanId, latestScanId])

  useEffect(() => {
    const status = scan?.status ?? null
    if (status === 'succeeded' && prevScanStatusRef.current !== 'succeeded') {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.findingsBase })
      void queryClient.invalidateQueries({ queryKey: reviewKeys.scans })
    }
    prevScanStatusRef.current = status
  }, [scan?.status, queryClient])

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
        input: { resolution: 'resolved', note: notes[key]?.trim() || undefined },
      })
      toast.success('已标记为已解决')
      updateNote(key, '')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败，请重试')
    }
  }

  async function handleReject(item: ReviewFinding) {
    const key = findingKey(item)
    try {
      await setResolution.mutateAsync({
        target: {
          findingType: item.finding_type,
          targetType: item.target_type,
          targetId: item.target_id,
        },
        input: { resolution: 'rejected', note: notes[key]?.trim() || undefined },
      })
      toast.success('已拒绝该问题')
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
      toast.success('已恢复，问题回到待处理')
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

  function scanSummary(scanItem: ReviewScan): string {
    const parts = [`发现 ${scanItem.findings_count} 条新问题`]
    if (scanItem.resurfaced_count > 0) {
      parts.push(`${scanItem.resurfaced_count} 条已处理问题已重新浮现`)
    }
    if (scanItem.skipped_rejected_count > 0) {
      parts.push(`跳过已拒绝 ${scanItem.skipped_rejected_count} 条`)
    }
    if (scanItem.truncated) {
      parts.push('（达到上限，建议缩小范围）')
    }
    return parts.join('，')
  }

  const emptyMessages: Record<Exclude<ReviewTab, 'history'>, [string, string]> = {
    open: ['没有待处理问题', '知识库的检查均通过'],
    resolved: ['还没有已处理记录', '标记为已解决的问题会显示在这里，可随时撤销'],
    rejected: ['还没有已拒绝记录', '拒绝的问题会显示在这里，可随时恢复'],
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
            <span>
              正在扫描（开始于 {formatTime(scan.started_at ?? scan.created_at)}）
            </span>
          ) : scan.status === 'failed' ? (
            <>
              <strong>扫描失败</strong>
              <span>{scan.last_error ?? '请重试'}</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleStartScan()}
              >
                <RefreshCw size={14} />
                重新扫描
              </button>
            </>
          ) : (
            <span>{scanSummary(scan)}</span>
          )}
        </div>
      )}

      <div className="review-tabs" role="tablist" aria-label="Review 视图">
        {tabOptions.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`review-tab${tab === value ? ' active' : ''}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== 'history' && (
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
      )}

      {tab === 'history' ? (
        <div className="review-history">
          {historyQuery.isPending && (
            <div className="state-panel" role="status">
              <span className="spin state-spinner" />
              正在加载审查记录
            </div>
          )}
          {historyQuery.isError && (
            <div className="state-panel state-error" role="alert">
              <strong>加载失败</strong>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void historyQuery.refetch()}
              >
                <RefreshCw size={14} />
                重试
              </button>
            </div>
          )}
          {historyQuery.isSuccess && historyItems.length === 0 && (
            <div className="state-panel" role="status">
              <strong>还没有审查记录</strong>
              <span>选择范围并开始审查后，记录会显示在这里</span>
            </div>
          )}
          {historyQuery.isSuccess && historyItems.length > 0 && (
            <>
              <div className="review-history-list">
                {historyItems.map((scanItem) => {
                  const isOpen = Boolean(expandedScans[scanItem.id])
                  const summary = scanItem.decision_summary ?? {
                    resolved: 0,
                    rejected: 0,
                    pending: 0,
                  }
                  return (
                    <article key={scanItem.id} className="review-card review-history-card">
                      <header className="review-card-head">
                        <span className="badge">
                          {scanStatusLabels[scanItem.status] ?? scanItem.status}
                        </span>
                        <h3>
                          {scanItem.scope_name ?? '全部工作区'}
                          <span className="review-card-time">
                            {formatTime(scanItem.created_at)}
                          </span>
                        </h3>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() =>
                            setExpandedScans((prev) => ({
                              ...prev,
                              [scanItem.id]: !prev[scanItem.id],
                            }))
                          }
                        >
                          {isOpen ? '收起' : '详情'}
                          {isOpen ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>
                      </header>
                      <p className="review-card-summary">
                        开始 {formatTime(scanItem.created_at)} · 结束{' '}
                        {formatTime(scanItem.finished_at)} · 耗时{' '}
                        {formatDuration(scanItem.duration_seconds)}
                      </p>
                      <p className="review-card-summary">{scanSummary(scanItem)}</p>
                      <p className="review-card-resolution">
                        决策跟进：已解决 {summary.resolved} · 已拒绝{' '}
                        {summary.rejected} · 待决定 {summary.pending}
                      </p>
                      {isOpen && scanItem.status === 'failed' && (
                        <div className="review-detail">
                          <div className="review-detail-row">
                            <span>失败原因</span>
                            <p>{scanItem.last_error ?? '未知错误'}</p>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
              {historyItems.length < historyQuery.data.total && (
                <button
                  type="button"
                  className="secondary-button review-history-more"
                  disabled={historyQuery.isFetching}
                  onClick={() => setHistoryOffset((prev) => prev + 20)}
                >
                  加载更多
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {findingsQuery.isPending && (
            <div className="state-panel" role="status">
              <span className="spin state-spinner" />
              正在加载问题
            </div>
          )}
          {findingsQuery.isError && (
            <div className="state-panel state-error" role="alert">
              <strong>加载失败</strong>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void findingsQuery.refetch()}
              >
                <RefreshCw size={14} />
                重试
              </button>
            </div>
          )}
          {findingsQuery.isSuccess && findings.length === 0 && (
            <div className="state-panel" role="status">
              <strong>{emptyMessages[tab][0]}</strong>
              <span>{emptyMessages[tab][1]}</span>
            </div>
          )}
          {findingsQuery.isSuccess && findings.length > 0 && (
            <div className="review-list">
              {findings.map((item) => {
                const key = findingKey(item)
                const isExpanded = Boolean(expanded[key])
                return (
                  <article key={key} className="review-card">
                    <header className="review-card-head">
                      <span className="badge">
                        {findingTypeLabels[item.finding_type]}
                      </span>
                      <h3>{item.title}</h3>
                      {item.ai_severity && (
                        <span
                          className={`review-severity severity-${item.ai_severity}`}
                        >
                          {item.ai_severity === 'error'
                            ? '严重'
                            : item.ai_severity === 'warning'
                              ? '警告'
                              : '提示'}
                        </span>
                      )}
                      <span className="review-card-time">
                        {formatTime(
                          tab === 'open'
                            ? item.created_at
                            : item.resolved_at,
                        )}
                      </span>
                    </header>
                    <p className="review-card-summary">{item.summary}</p>
                    {tab !== 'open' && item.resolution && (
                      <p className="review-card-resolution">
                        {item.resolution === 'resolved' ? '已解决' : '已拒绝'}
                        {item.note ? `：${item.note}` : ''}
                      </p>
                    )}
                    <div className="review-card-actions">
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => toggle(key)}
                      >
                        {isExpanded ? '收起详情' : '查看详情'}
                        {isExpanded ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                      {tab === 'open' ? (
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
                            onClick={() => void handleReject(item)}
                          >
                            拒绝
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
                          {tab === 'rejected' ? '恢复' : '撤销'}
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="review-detail">
                        <FindingDetail
                          item={item}
                          onNavigate={(path) => navigate(path)}
                        />
                        {tab === 'open' && (
                          <div className="review-detail-actions">
                            <input
                              value={notes[key] ?? ''}
                              onChange={(event) =>
                                updateNote(key, event.target.value)
                              }
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
        </>
      )}
    </div>
  )
}
