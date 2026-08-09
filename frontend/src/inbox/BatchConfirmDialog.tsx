import { CheckCheck, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { entryTypeLabel, sourceTypeLabels } from './labels'
import {
  useBatchConfirmDetails,
  useBatchConfirmSources,
} from './queries'
import type { Extraction, SourceDetail, SourceItem } from './types'
import { useToast } from '../components/useToast'
import { mutationMessage } from '../projects/errors'
import { useNodes, useProjects } from '../projects/queries'

const LOW_CONFIDENCE_THRESHOLD = 0.7

function isLowConfidence(extraction: Extraction) {
  return (
    extraction.confidence !== null
    && extraction.confidence < LOW_CONFIDENCE_THRESHOLD
  )
}

function isConfirmable(extraction: Extraction) {
  return (
    extraction.status === 'pending_confirm' && !isLowConfidence(extraction)
  )
}

interface Props {
  sources: SourceItem[]
  onClose: () => void
}

export default function BatchConfirmDialog({ sources, onClose }: Props) {
  const sourceIds = useMemo(
    () => sources.map((source) => source.id),
    [sources],
  )
  const detailsQuery = useBatchConfirmDetails(sourceIds)
  const projectsQuery = useProjects()
  const confirmMutation = useBatchConfirmSources()
  const toast = useToast()
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [projectId, setProjectId] = useState('')
  const [nodeId, setNodeId] = useState('')
  const initializedRef = useRef(false)
  const nodesQuery = useNodes(projectId)

  const detailsById = useMemo(() => {
    const map = new Map<string, SourceDetail>()
    for (const detail of detailsQuery.data ?? []) {
      map.set(detail.id, detail)
    }
    return map
  }, [detailsQuery.data])

  const rows = useMemo(
    () =>
      sources.map((source) => {
        const detail = detailsById.get(source.id)
        const extractions = detail?.extractions ?? []
        const confirmable = extractions.filter(isConfirmable)
        const lowConfidence = extractions.filter(
          (item) => item.status === 'pending_confirm' && isLowConfidence(item),
        )
        return { source, confirmable, lowConfidence }
      }),
    [sources, detailsById],
  )

  const hasLoaded = detailsQuery.isSuccess
  useEffect(() => {
    if (hasLoaded && !initializedRef.current) {
      initializedRef.current = true
      setCheckedIds(
        new Set(
          rows
            .filter((row) => row.confirmable.length > 0)
            .map((row) => row.source.id),
        ),
      )
    }
  }, [hasLoaded, rows])

  const confirmableTotal = rows
    .filter((row) => checkedIds.has(row.source.id))
    .reduce((sum, row) => sum + row.confirmable.length, 0)
  const lowConfidenceTotal = rows.reduce(
    (sum, row) => sum + row.lowConfidence.length,
    0,
  )

  function toggleSource(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function submit() {
    if (!projectId || confirmableTotal === 0) return
    try {
      const result = await confirmMutation.mutateAsync({
        sourceIds: rows
          .filter((row) => checkedIds.has(row.source.id))
          .map((row) => row.source.id),
        projectId,
        ...(nodeId ? { nodeId } : {}),
      })
      const summary = `已确认 ${result.confirmed_sources} 条来源，生成 ${result.entries_created} 条正式记录`
      toast.success(
        result.skipped_low_confidence > 0
          ? `${summary}，${result.skipped_low_confidence} 条低置信度保持待确认`
          : summary,
      )
      onClose()
    } catch {
      // 错误通过 mutation 状态展示，弹窗保留全部选择
    }
  }

  const error = confirmMutation.isError
    ? mutationMessage(confirmMutation.error, '批量确认失败，请重试')
    : null

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog-panel dialog-panel-wide"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="batch-confirm-title"
      >
        <header className="dialog-header">
          <div className="confirm-heading">
            <CheckCheck size={20} aria-hidden="true" />
            <h2 id="batch-confirm-title">批量确认候选</h2>
          </div>
          <button
            type="button"
            className="icon-action"
            onClick={onClose}
            aria-label="关闭"
            disabled={confirmMutation.isPending}
          >
            <X size={18} />
          </button>
        </header>

        {detailsQuery.isPending && (
          <div className="state-panel" role="status">
            <span className="spin state-spinner" />
            正在加载候选预览
          </div>
        )}
        {detailsQuery.isError && (
          <div className="state-panel state-error" role="alert">
            <strong>候选预览加载失败</strong>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void detailsQuery.refetch()}
            >
              <RefreshCw size={14} />
              重试
            </button>
          </div>
        )}

        {hasLoaded && (
          <>
            <p className="dialog-description">
              将按 AI 候选内容直接生成正式记录；生成后可在记录页单条编辑，并会进入 Review
              的检查范围。低置信度候选不会被纳入，保持待确认逐条处理。
            </p>
            <div className="batch-confirm-summary" role="status">
              已选 {rows.filter((row) => checkedIds.has(row.source.id)).length} 条资料
              · 共 {confirmableTotal} 条可确认候选
              {lowConfidenceTotal > 0 && (
                <span className="batch-summary-skip">
                  · {lowConfidenceTotal} 条低置信度不纳入
                </span>
              )}
            </div>

            <div className="batch-confirm-source-list">
              {rows.map((row) => {
                const disabled = row.confirmable.length === 0
                const checked = checkedIds.has(row.source.id)
                return (
                  <div
                    key={row.source.id}
                    className={`batch-source-row${disabled ? ' disabled' : ''}`}
                  >
                    <label className="batch-source-check">
                      <input
                        type="checkbox"
                        aria-label={`确认 ${row.source.title}`}
                        checked={checked}
                        disabled={disabled || confirmMutation.isPending}
                        onChange={() => toggleSource(row.source.id)}
                      />
                      <span>
                        <strong>{row.source.title}</strong>
                        <small>
                          {sourceTypeLabels[row.source.source_type]} ·{' '}
                          {row.confirmable.length} 条可确认
                        </small>
                      </span>
                    </label>
                    {disabled && (
                      <span className="batch-source-hint">无可批量确认候选</span>
                    )}
                    <ul className="batch-candidate-list">
                      {row.confirmable.map((extraction) => (
                        <li key={extraction.id} className="batch-candidate">
                          <span className="badge">
                            {entryTypeLabel(extraction.entry_type)}
                          </span>
                          <span className="batch-candidate-title">
                            {extraction.title}
                          </span>
                          {extraction.confidence !== null && (
                            <span className="batch-candidate-confidence">
                              置信度 {Math.round(extraction.confidence * 100)}%
                            </span>
                          )}
                        </li>
                      ))}
                      {row.lowConfidence.map((extraction) => (
                        <li
                          key={extraction.id}
                          className="batch-candidate low-confidence"
                        >
                          <span className="badge">
                            {entryTypeLabel(extraction.entry_type)}
                          </span>
                          <span className="batch-candidate-title">
                            {extraction.title}
                          </span>
                          <span className="batch-candidate-confidence">
                            不纳入批量
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>

            <div className="form-stack batch-confirm-fields">
              <div className="form-field">
                <span>归档项目（必选）</span>
                <select
                  aria-label="归档项目"
                  value={projectId}
                  onChange={(event) => {
                    setProjectId(event.target.value)
                    setNodeId('')
                  }}
                  disabled={confirmMutation.isPending}
                >
                  <option value="">请选择项目</option>
                  {(projectsQuery.data ?? []).map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <span>统一归档节点（可选）</span>
                <select
                  aria-label="统一归档节点"
                  value={nodeId}
                  onChange={(event) => setNodeId(event.target.value)}
                  disabled={!projectId || confirmMutation.isPending}
                >
                  <option value="">暂不归档</option>
                  {(nodesQuery.data ?? []).map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}

            <footer className="dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={confirmMutation.isPending}
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void submit()}
                disabled={
                  !projectId
                  || confirmableTotal === 0
                  || confirmMutation.isPending
                }
              >
                {confirmMutation.isPending
                  ? '确认中…'
                  : `确认生成 ${confirmableTotal} 条正式记录`}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}
