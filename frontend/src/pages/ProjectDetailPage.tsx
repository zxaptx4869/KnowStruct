import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ConfirmDialog from '../projects/ConfirmDialog'
import MoveNodeDialog from '../projects/MoveNodeDialog'
import NodeDialog from '../projects/NodeDialog'
import ProjectDialog from '../projects/ProjectDialog'
import { mutationMessage } from '../projects/errors'
import { entryTypeLabel, entryTypeOptions, sourceTypeLabels } from '../inbox/labels'
import {
  useCreateNode,
  useBatchDeleteEntries,
  useBatchMoveEntries,
  useDeleteEntry,
  useDeleteNode,
  useDeleteProject,
  useMoveNode,
  useNodeEntries,
  useNodes,
  useProject,
  useProjectEntries,
  useUpdateEntry,
  useUpdateNode,
  useUpdateProject,
} from '../projects/queries'
import {
  breadcrumbs,
  buildTree,
  childrenOf,
  descendants,
  dropIntentFromGeometry,
  moveForDrop,
  ROOT_DROP_ID,
  visibleNodes,
  type DropIntent,
  type TreeNode,
} from '../projects/tree'
import { projectStatusLabel, type Node, type NodeInput, type ProjectInput } from '../projects/types'
import type { EntryUpdateInput, NodeEntry } from '../projects/types'

interface NodeMenuProps {
  node: Node
  onAdd: () => void
  onEdit: () => void
  onMove: () => void
  onDelete: () => void
  ariaLabel?: string
}

function NodeRecordCard({
  entry,
  nodeLabel,
  onOpenSource,
  onEdit,
  onDelete,
}: {
  entry: NodeEntry
  nodeLabel?: string | null
  onOpenSource: (sourceId: string) => void
  onEdit: (entry: NodeEntry) => void
  onDelete: (entry: NodeEntry) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target
      if (
        menuRef.current
        && target instanceof globalThis.Node
        && !menuRef.current.contains(target)
      ) {
        close()
      }
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  return (
    <article className="record-card">
      <header className="record-head">
        <span className="badge">{entryTypeLabel(entry.entry_type)} · Entry</span>
        <h4>{entry.title}</h4>
        <div ref={menuRef} className="record-menu" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="icon-action compact-action"
            aria-label={`管理记录：${entry.title}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="action-menu record-action-menu">
              <button type="button" onClick={() => { setMenuOpen(false); onEdit(entry) }}>编辑记录</button>
              <button type="button" className="danger-text" onClick={() => { setMenuOpen(false); onDelete(entry) }}>删除记录</button>
            </div>
          )}
        </div>
      </header>
      <p className="record-content">{entry.content}</p>
      {nodeLabel && (
        <p className={`record-node-label${nodeLabel === '未归档' ? ' unarchived' : ''}`}>
          {nodeLabel === '未归档' ? '未归档' : `归档：${nodeLabel}`}
        </p>
      )}
      {entry.applicable_conditions && entry.applicable_conditions.length > 0 && (
        <p className="record-conditions">
          适用条件：{entry.applicable_conditions.join('；')}
        </p>
      )}
      {entry.sources.length > 0 && (
        <div className="record-source-chips">
          {entry.sources.map((source) => (
            <button
              key={source.id}
              type="button"
              className="record-source-chip"
              onClick={() => onOpenSource(source.id)}
              aria-label={`打开来源：${source.title}`}
            >
              {sourceTypeLabels[source.source_type]} · {source.title}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}

function EntryEditDialog({
  entry,
  projectId,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  entry: NodeEntry
  projectId: string
  pending: boolean
  error: unknown
  onClose: () => void
  onSubmit: (input: EntryUpdateInput) => Promise<void>
}) {
  const nodesQuery = useNodes(projectId)
  const [title, setTitle] = useState(entry.title)
  const [entryType, setEntryType] = useState(entry.entry_type)
  const [content, setContent] = useState(entry.content)
  const [conditions, setConditions] = useState(
    (entry.applicable_conditions ?? []).join('；'),
  )
  const [nodeId, setNodeId] = useState(entry.node_id ?? '')
  const [validation, setValidation] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) {
      setValidation('请输入记录标题')
      return
    }
    if (!content.trim()) {
      setValidation('请输入记录内容')
      return
    }
    await onSubmit({
      title: title.trim(),
      content: content.trim(),
      entry_type: entryType,
      applicable_conditions: conditions
        .split(/[；;]/)
        .map((item) => item.trim())
        .filter(Boolean),
      node_id: nodeId || null,
    })
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="entry-dialog-title">
        <header className="dialog-header">
          <h2 id="entry-dialog-title">编辑记录</h2>
          <button type="button" className="icon-action" onClick={onClose} aria-label="关闭" disabled={pending}><X size={18} /></button>
        </header>
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="form-field">
            <span>记录标题</span>
            <input value={title} onChange={(event) => { setTitle(event.target.value); setValidation('') }} maxLength={200} autoFocus />
          </label>
          <label className="form-field">
            <span>记录类型</span>
            <select value={entryType} onChange={(event) => setEntryType(event.target.value)}>
              {entryTypeOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>记录内容</span>
            <textarea rows={5} value={content} onChange={(event) => { setContent(event.target.value); setValidation('') }} />
          </label>
          <label className="form-field">
            <span>适用条件</span>
            <input value={conditions} onChange={(event) => setConditions(event.target.value)} placeholder="用分号分隔多条条件" />
          </label>
          <label className="form-field">
            <span>归档节点</span>
            <select value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
              <option value="">未归档</option>
              {(nodesQuery.data ?? []).map((node) => (
                <option key={node.id} value={node.id}>{node.name}</option>
              ))}
            </select>
          </label>
          {(validation || Boolean(error)) && (
            <div className="inline-error" role="alert">
              {validation || mutationMessage(error, '记录保存失败，请重试')}
            </div>
          )}
          <footer className="dialog-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={pending}>取消</button>
            <button type="submit" className="primary-button" disabled={pending}>{pending ? '保存中' : '保存更改'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}

function NodeRecordsSection({ projectId, nodeId }: { projectId: string, nodeId: string }) {
  const navigate = useNavigate()
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all')
  const [editingRecord, setEditingRecord] = useState<NodeEntry | null>(null)
  const [deletingRecord, setDeletingRecord] = useState<NodeEntry | null>(null)
  const entriesQuery = useNodeEntries(projectId, nodeId)
  const updateMutation = useUpdateEntry(projectId, editingRecord?.id ?? '')
  const deleteMutation = useDeleteEntry(projectId)
  const entries = entriesQuery.data ?? []
  const filtered = typeFilter === 'all'
    ? entries
    : entries.filter((entry) => entry.entry_type === typeFilter)
  const noRecords = entries.length === 0
  const noMatches = entries.length > 0 && filtered.length === 0

  async function saveRecord(input: EntryUpdateInput) {
    try {
      await updateMutation.mutateAsync(input)
      setEditingRecord(null)
    } catch {
      // Dialog stays open with the error and preserved input.
    }
  }

  async function confirmDeleteRecord() {
    if (!deletingRecord) return
    try {
      await deleteMutation.mutateAsync(deletingRecord.id)
      setDeletingRecord(null)
    } catch {
      // Confirmation stays open with the API error.
    }
  }

  return (
    <section className="records-section">
      <header className="records-head">
        <div><h3>正式记录</h3><span>{filtered.length} 条</span></div>
        <div className="record-type-chips" role="group" aria-label="按记录类型筛选">
          <button type="button" className={typeFilter === 'all' ? 'chip active' : 'chip'} onClick={() => setTypeFilter('all')}>全部</button>
          {entryTypeOptions.map(([value, label]) => (
            <button key={value} type="button" className={typeFilter === value ? 'chip active' : 'chip'} onClick={() => setTypeFilter(value)}>{label}</button>
          ))}
        </div>
      </header>
      {entriesQuery.isPending && (
        <div className="state-panel" role="status"><span className="spin state-spinner" />正在加载正式记录</div>
      )}
      {entriesQuery.isError && (
        <div className="state-panel state-error" role="alert">
          <strong>正式记录加载失败</strong>
          <button type="button" className="secondary-button" onClick={() => void entriesQuery.refetch()}><RefreshCw size={16} />重试</button>
        </div>
      )}
      {entriesQuery.isSuccess && noRecords && (
        <div className="inline-empty"><FileText size={22} /><div><strong>该节点还没有正式记录</strong><span>接受的提取候选归档到本节点后会显示在这里。</span></div></div>
      )}
      {entriesQuery.isSuccess && noMatches && (
        <div className="inline-empty"><FileText size={22} /><div><strong>当前筛选下没有记录</strong><span>切换回"全部"查看该节点的完整记录。</span></div></div>
      )}
      {filtered.length > 0 && (
        <div className="record-list">
          {filtered.map((entry) => (
            <NodeRecordCard
              key={entry.id}
              entry={entry}
              onOpenSource={(sourceId) => navigate(`/inbox/${sourceId}`)}
              onEdit={setEditingRecord}
              onDelete={setDeletingRecord}
            />
          ))}
        </div>
      )}
      {editingRecord && (
        <EntryEditDialog
          entry={editingRecord}
          projectId={projectId}
          pending={updateMutation.isPending}
          error={updateMutation.error}
          onClose={() => { setEditingRecord(null); updateMutation.reset() }}
          onSubmit={saveRecord}
        />
      )}
      {deletingRecord && (
        <ConfirmDialog
          title="删除记录？"
          description={`将永久删除“${deletingRecord.title}”，原始来源会保留。`}
          confirmLabel="删除记录"
          pending={deleteMutation.isPending}
          error={deleteMutation.error}
          onClose={() => { setDeletingRecord(null); deleteMutation.reset() }}
          onConfirm={confirmDeleteRecord}
        />
      )}
    </section>
  )
}

function NodeMenu({ node, onAdd, onEdit, onMove, onDelete, ariaLabel }: NodeMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number, left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function toggleMenu() {
    if (open) {
      setOpen(false)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuWidth = 158
    const menuHeight = 146
    const gap = 4
    const viewportPadding = 8
    const opensBelow = window.innerHeight - rect.bottom >= menuHeight + gap
    setPosition({
      top: opensBelow
        ? rect.bottom + gap
        : Math.max(viewportPadding, rect.top - menuHeight - gap),
      left: Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding,
      ),
    })
    setOpen(true)
  }

  return (
    <div className="row-actions" onClick={(event) => event.stopPropagation()}>
      <button ref={triggerRef} type="button" className="icon-action compact-action" aria-label={ariaLabel ?? `管理 ${node.name}`} aria-expanded={open} onClick={toggleMenu}><MoreHorizontal size={16} /></button>
      {open && position && createPortal(
        <div
          className="action-menu tree-action-menu tree-action-menu-portal"
          data-testid={`node-menu-${node.id}`}
          style={{ top: position.top, left: position.left }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => { setOpen(false); onAdd() }}>创建子节点</button>
          <button type="button" onClick={() => { setOpen(false); onEdit() }}>编辑节点</button>
          <button type="button" onClick={() => { setOpen(false); onMove() }}>移动到…</button>
          <button type="button" className="danger-text" onClick={() => { setOpen(false); onDelete() }}>删除子树</button>
        </div>,
        document.body,
      )}
    </div>
  )
}

interface SortableTreeRowProps extends NodeMenuProps {
  treeNode: TreeNode
  selected: boolean
  expanded: boolean
  dropIntent?: Exclude<DropIntent, 'root'>
  onToggle: () => void
  onSelect: () => void
}

function SortableTreeRow({ treeNode, selected, expanded, dropIntent, onToggle, onSelect, ...menu }: SortableTreeRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: treeNode.id })
  return (
    <div
      ref={setNodeRef}
      className={`tree-row${selected ? ' selected' : ''}${isDragging ? ' dragging' : ''}${dropIntent ? ` drop-${dropIntent}` : ''}`}
      role="treeitem"
      aria-level={treeNode.depth}
      style={{ paddingLeft: `${8 + (treeNode.depth - 1) * 18}px`, transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className="tree-drag" aria-label={`拖动 ${treeNode.name}`} title="拖动排序或移到其他节点" {...attributes} {...listeners}><GripVertical size={14} /></button>
      <button type="button" className="tree-toggle" onClick={onToggle} aria-label={expanded ? '折叠' : '展开'} disabled={!treeNode.children.length}>
        {treeNode.children.length ? expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span />}
      </button>
      <button type="button" className="tree-label" onClick={onSelect} title={treeNode.name}>
        {expanded && treeNode.children.length ? <FolderOpen size={15} /> : <Folder size={15} />}
        <span>{treeNode.name}</span>
        {treeNode.entry_count > 0 && <span className="tree-entry-count">{treeNode.entry_count}</span>}
      </button>
      <NodeMenu {...menu} />
    </div>
  )
}

function RootDropTarget({ dragging }: { dragging: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: ROOT_DROP_ID })
  return (
    <div ref={setNodeRef} className={`tree-root-drop${dragging ? ' active' : ''}${isOver ? ' over' : ''}`}>
      <FolderOpen size={15} />
      <span>{isOver ? '放到项目根目录末尾' : dragging ? '拖到这里成为一级目录' : '项目根目录'}</span>
    </div>
  )
}

function dropIntentForEvent(event: DragMoveEvent | DragEndEvent, nodes: Node[]): DropIntent | null {
  if (!event.over) return null
  const overId = String(event.over.id)
  if (overId === ROOT_DROP_ID) return 'root'

  const active = nodes.find((node) => node.id === String(event.active.id))
  const over = nodes.find((node) => node.id === overId)
  if (!active || !over) return null
  if (event.activatorEvent instanceof KeyboardEvent) {
    if (active.parent_id !== over.parent_id) return 'inside'
    return active.sort_order < over.sort_order ? 'after' : 'before'
  }

  const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial
  const activeCenterY = activeRect ? activeRect.top + activeRect.height / 2 : event.over.rect.top + event.over.rect.height / 2
  return dropIntentFromGeometry(activeCenterY, event.over.rect.top, event.over.rect.height)
}

function ProjectRecordsSection({
  projectId,
  filter,
  onFilterChange,
  mobile,
}: {
  projectId: string
  filter: string
  onFilterChange: (filter: string) => void
  mobile?: boolean
}) {
  const navigate = useNavigate()
  const nodesQuery = useNodes(projectId)
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all')
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchTargetNode, setBatchTargetNode] = useState('')
  const [batchError, setBatchError] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<NodeEntry | null>(null)
  const [deletingRecord, setDeletingRecord] = useState<NodeEntry | null>(null)
  const updateMutation = useUpdateEntry(projectId, editingRecord?.id ?? '')
  const deleteMutation = useDeleteEntry(projectId)
  const moveMutation = useBatchMoveEntries(projectId)
  const deleteBatchMutation = useBatchDeleteEntries(projectId)

  const recordsQuery = useProjectEntries(projectId, appliedKeyword || undefined)
  const records = recordsQuery.data?.items ?? []
  const total = recordsQuery.data?.total ?? 0
  const unarchivedCount = recordsQuery.data?.unarchived_count ?? 0
  const matchedCount = recordsQuery.data?.matched_count ?? records.length

  useEffect(() => {
    setSelectedIds(new Set())
    setBatchError(null)
  }, [filter, typeFilter, appliedKeyword])

  function submitKeyword() {
    setAppliedKeyword(keyword.trim())
    setSelectedIds(new Set())
  }

  const filtered = records.filter((entry) => {
    if (filter === 'unarchived' && entry.node_id !== null) return false
    if (filter !== 'all' && filter !== 'unarchived' && entry.node_id !== filter) return false
    if (typeFilter !== 'all' && entry.entry_type !== typeFilter) return false
    return true
  })
  const noRecords = records.length === 0 && total === 0
  const noMatches = !noRecords && filtered.length === 0

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (filtered.length > 0 && filtered.every((entry) => prev.has(entry.id))) {
        return new Set()
      }
      return new Set(filtered.map((entry) => entry.id))
    })
  }

  async function saveRecord(input: EntryUpdateInput) {
    try {
      await updateMutation.mutateAsync(input)
      setEditingRecord(null)
    } catch {
      // Dialog stays open with the error and preserved input.
    }
  }

  async function confirmDeleteRecord() {
    if (!deletingRecord) return
    try {
      await deleteMutation.mutateAsync(deletingRecord.id)
      setDeletingRecord(null)
    } catch {
      // Confirmation stays open with the API error.
    }
  }

  async function runBatchMove() {
    if (selectedIds.size === 0) return
    setBatchError(null)
    try {
      await moveMutation.mutateAsync({
        entry_ids: [...selectedIds],
        node_id: batchTargetNode || null,
      })
      setSelectedIds(new Set())
      setBatchTargetNode('')
    } catch (error) {
      setBatchError(mutationMessage(error, '批量移动失败，请重试'))
    }
  }

  async function runBatchDelete() {
    if (selectedIds.size === 0) return
    const confirmed = window.confirm(
      `确定删除选中的 ${selectedIds.size} 条记录？原始来源会保留。`,
    )
    if (!confirmed) return
    setBatchError(null)
    try {
      await deleteBatchMutation.mutateAsync([...selectedIds])
      setSelectedIds(new Set())
    } catch (error) {
      setBatchError(mutationMessage(error, '批量删除失败，请重试'))
    }
  }

  const batchPending = moveMutation.isPending || deleteBatchMutation.isPending

  return (
    <section className="records-section">
      <header className="records-head">
        <div>
          <h3>{appliedKeyword ? '搜索记录' : '全部记录'}</h3>
          <span>
            {appliedKeyword
              ? `共 ${total} 条 · 匹配 ${matchedCount} 条`
              : `${total} 条 · 未归档 ${unarchivedCount} 条`}
          </span>
        </div>
        {mobile && (
          <div className="record-type-chips" role="group" aria-label="按状态筛选">
            <button
              type="button"
              className={filter === 'all' ? 'chip active' : 'chip'}
              onClick={() => onFilterChange('all')}
            >
              全部
            </button>
            <button
              type="button"
              className={filter === 'unarchived' ? 'chip active' : 'chip'}
              onClick={() => onFilterChange('unarchived')}
            >
              未归档
            </button>
          </div>
        )}
      </header>
      {!mobile && (
        <form
          className="record-search-form"
          onSubmit={(event) => {
            event.preventDefault()
            submitKeyword()
          }}
        >
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索记录标题或内容"
            aria-label="搜索记录"
          />
          <button type="submit" className="secondary-button">搜索</button>
          {appliedKeyword && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setKeyword('')
                setAppliedKeyword('')
              }}
            >
              清除
            </button>
          )}
        </form>
      )}
      <div className="record-type-chips" role="group" aria-label="按记录类型筛选">
        <button
          type="button"
          className={typeFilter === 'all' ? 'chip active' : 'chip'}
          onClick={() => setTypeFilter('all')}
        >
          全部类型
        </button>
        {entryTypeOptions.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={typeFilter === value ? 'chip active' : 'chip'}
            onClick={() => setTypeFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {recordsQuery.isPending && (
        <div className="state-panel" role="status">
          <span className="spin state-spinner" />正在加载正式记录
        </div>
      )}
      {recordsQuery.isError && (
        <div className="state-panel state-error" role="alert">
          <strong>正式记录加载失败</strong>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void recordsQuery.refetch()}
          >
            <RefreshCw size={16} />重试
          </button>
        </div>
      )}
      {recordsQuery.isSuccess && noRecords && (
        <div className="inline-empty">
          <FileText size={22} />
          <div>
            <strong>还没有正式记录</strong>
            <span>接受的提取候选归档后会显示在这里。</span>
          </div>
        </div>
      )}
      {recordsQuery.isSuccess && noMatches && (
        <div className="inline-empty">
          <FileText size={22} />
          <div>
            <strong>没有找到匹配的记录</strong>
            <span>调整关键词或筛选条件查看其他记录。</span>
          </div>
        </div>
      )}

      {filtered.length > 0 && !mobile && (
        <>
          {selectedIds.size > 0 && (
            <div className="batch-toolbar" role="group" aria-label="批量操作">
              <span className="batch-count">已选 {selectedIds.size} 条</span>
              <select
                value={batchTargetNode}
                onChange={(event) => setBatchTargetNode(event.target.value)}
                aria-label="移动到节点目标"
              >
                <option value="">移动到未归档</option>
                {(nodesQuery.data ?? []).map((node) => (
                  <option key={node.id} value={node.id}>{node.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void runBatchMove()}
                disabled={batchPending}
              >
                {moveMutation.isPending ? '移动中…' : '移动到节点'}
              </button>
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={() => void runBatchDelete()}
                disabled={batchPending}
              >
                <Trash2 size={15} />
                {deleteBatchMutation.isPending ? '删除中…' : '删除'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSelectedIds(new Set())
                  setBatchError(null)
                }}
              >
                取消选择
              </button>
              {batchError && (
                <span className="inline-error batch-error" role="alert">
                  {batchError}
                </span>
              )}
            </div>
          )}
          <div className="records-table-wrap">
            <table className="project-table records-table">
              <thead>
                <tr>
                  <th className="source-select-col">
                    <input
                      type="checkbox"
                      aria-label="全选当前筛选"
                      checked={
                        filtered.length > 0
                        && filtered.every((entry) => selectedIds.has(entry.id))
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>记录</th>
                  <th>节点</th>
                  <th>来源</th>
                  <th>时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td
                      className="source-select-cell"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`选择 ${entry.title}`}
                        checked={selectedIds.has(entry.id)}
                        onChange={() => toggleSelected(entry.id)}
                      />
                    </td>
                    <td className="records-title-cell">
                      <strong>{entry.title}</strong>
                      <span>
                        {entryTypeLabel(entry.entry_type)} · {entry.content.slice(0, 60)}
                      </span>
                    </td>
                    <td>
                      {entry.node_id
                        ? ((entry.node_path ?? []).join(' / ') || '—')
                        : <span className="unarchived-badge">未归档</span>}
                    </td>
                    <td>{entry.sources.length}</td>
                    <td>{new Date(entry.created_at).toLocaleString('zh-CN')}</td>
                    <td>
                      <div className="record-row-actions">
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => setEditingRecord(entry)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="btn small danger-text"
                          onClick={() => setDeletingRecord(entry)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {filtered.length > 0 && mobile && (
        <div className="record-list">
          {filtered.map((entry) => (
            <NodeRecordCard
              key={entry.id}
              entry={entry}
              nodeLabel={entry.node_id ? (entry.node_path ?? []).join(' / ') : '未归档'}
              onOpenSource={(sourceId) => navigate(`/inbox/${sourceId}`)}
              onEdit={setEditingRecord}
              onDelete={setDeletingRecord}
            />
          ))}
        </div>
      )}
      {editingRecord && (
        <EntryEditDialog
          entry={editingRecord}
          projectId={projectId}
          pending={updateMutation.isPending}
          error={updateMutation.error}
          onClose={() => {
            setEditingRecord(null)
            updateMutation.reset()
          }}
          onSubmit={saveRecord}
        />
      )}
      {deletingRecord && (
        <ConfirmDialog
          title="删除记录？"
          description={`将永久删除“${deletingRecord.title}”，原始来源会保留。`}
          confirmLabel="删除记录"
          pending={deleteMutation.isPending}
          error={deleteMutation.error}
          onClose={() => {
            setDeletingRecord(null)
            deleteMutation.reset()
          }}
          onConfirm={confirmDeleteRecord}
        />
      )}
    </section>
  )
}

type NodeEditor = { mode: 'create', parentId: string | null } | { mode: 'edit', node: Node }

export default function ProjectDetailPage() {
  const { id = '', nid } = useParams<{ id: string, nid?: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const projectQuery = useProject(id)
  const nodesQuery = useNodes(id)
  const organizeMode = searchParams.get('mode') === 'organize'
  const recordFilter = searchParams.get('filter') ?? 'all'
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [nodeEditor, setNodeEditor] = useState<NodeEditor | null>(null)
  const [movingNode, setMovingNode] = useState<Node | null>(null)
  const [deletingNode, setDeletingNode] = useState<Node | null>(null)
  const [editingProject, setEditingProject] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)
  const [moveError, setMoveError] = useState<unknown>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [dropPreview, setDropPreview] = useState<{ overId: string, intent: DropIntent } | null>(null)

  const createNodeMutation = useCreateNode(id)
  const updateNodeMutation = useUpdateNode(id, nodeEditor?.mode === 'edit' ? nodeEditor.node.id : '')
  const moveMutation = useMoveNode(id)
  const deleteNodeMutation = useDeleteNode(id)
  const updateProjectMutation = useUpdateProject(id)
  const deleteProjectMutation = useDeleteProject(id)
  const nodes = useMemo(() => nodesQuery.data ?? [], [nodesQuery.data])
  const selectedNode = nid ? nodes.find((node) => node.id === nid) : undefined
  const path = breadcrumbs(nid, nodes)
  const currentChildren = childrenOf(nid ?? null, nodes)
  const treeResult = useMemo(() => {
    try {
      return { roots: buildTree(nodes), error: null as Error | null }
    } catch (error) {
      return { roots: [] as TreeNode[], error: error as Error }
    }
  }, [nodes])
  const flatVisible = visibleNodes(treeResult.roots, expanded)

  useEffect(() => {
    if (nodes.length) {
      setExpanded((current) => {
        const next = new Set(current)
        nodes.filter((node) => nodes.some((child) => child.parent_id === node.id)).forEach((node) => next.add(node.id))
        return next
      })
    }
  }, [nodes])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function openNode(nodeId: string) {
    navigate(`/projects/${id}/nodes/${nodeId}`)
  }

  function setOrganizeMode(next: boolean) {
    const params = new URLSearchParams(searchParams)
    if (next) {
      params.set('mode', 'organize')
      params.set('filter', 'all')
    } else {
      params.delete('mode')
      params.delete('filter')
    }
    setSearchParams(params, { replace: false })
  }

  function setRecordFilter(next: string) {
    const params = new URLSearchParams(searchParams)
    params.set('mode', 'organize')
    if (next === 'all') params.delete('filter')
    else params.set('filter', next)
    setSearchParams(params, { replace: false })
  }

  function handleTopBack() {
    if (organizeMode) {
      navigate(`/projects/${id}`)
      return
    }
    if (nid) {
      navigate(
        path.length > 1
          ? `/projects/${id}/nodes/${path[path.length - 2].id}`
          : `/projects/${id}`,
      )
      return
    }
    navigate('/')
  }

  async function saveNode(input: NodeInput) {
    try {
      if (nodeEditor?.mode === 'edit') await updateNodeMutation.mutateAsync(input)
      else await createNodeMutation.mutateAsync(input)
      setNodeEditor(null)
    } catch {
      // Mutation error remains visible with the preserved form input.
    }
  }

  async function moveNode(nodeId: string, parentId: string | null, position: number) {
    setMoveError(null)
    try {
      await moveMutation.mutateAsync({ nodeId, input: { parent_id: parentId, position } })
      setMovingNode(null)
      if (parentId) setExpanded((current) => new Set(current).add(parentId))
    } catch (error) {
      setMoveError(error)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : ''
    const intent = dropIntentForEvent(event, nodes)
    setActiveDragId(null)
    setDropPreview(null)
    if (!overId || !intent || activeId === overId) return
    const move = moveForDrop(activeId, overId, nodes, intent)
    if (move) await moveNode(activeId, move.parent_id, move.position)
  }

  function handleDragMove(event: DragMoveEvent) {
    const intent = dropIntentForEvent(event, nodes)
    setDropPreview(event.over && intent ? { overId: String(event.over.id), intent } : null)
  }

  async function confirmDeleteNode() {
    if (!deletingNode) return
    try {
      await deleteNodeMutation.mutateAsync(deletingNode.id)
      if (deletingNode.id === nid || descendants(deletingNode.id, nodes).some((node) => node.id === nid)) {
        navigate(deletingNode.parent_id ? `/projects/${id}/nodes/${deletingNode.parent_id}` : `/projects/${id}`)
      }
      setDeletingNode(null)
    } catch {
      // Confirmation remains open with the API error.
    }
  }

  async function saveProject(input: ProjectInput) {
    try {
      await updateProjectMutation.mutateAsync(input)
      setEditingProject(false)
    } catch {
      // Dialog remains open.
    }
  }

  async function confirmDeleteProject() {
    try {
      await deleteProjectMutation.mutateAsync()
      navigate('/', { replace: true })
    } catch {
      // Confirmation remains open.
    }
  }

  const toggleExpanded = (nodeId: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(nodeId)) next.delete(nodeId)
    else next.add(nodeId)
    return next
  })

  if (projectQuery.isPending || nodesQuery.isPending) {
    return <div className="state-panel project-state" role="status"><span className="spin state-spinner" />正在加载项目目录</div>
  }
  if (projectQuery.isError || nodesQuery.isError) {
    return (
      <div className="state-panel state-error project-state" role="alert">
        <strong>项目目录加载失败</strong><span>项目上下文已保留，当前结果不代表空目录。</span>
        <button type="button" className="secondary-button" onClick={() => void Promise.all([projectQuery.refetch(), nodesQuery.refetch()])}><RefreshCw size={16} />重试</button>
      </div>
    )
  }
  if (!projectQuery.data) return null
  const project = projectQuery.data
  if (treeResult.error) {
    return <div className="state-panel state-error project-state" role="alert"><strong>目录数据无法读取</strong><span>{treeResult.error.message}</span></div>
  }

  const nodeActions = (node: Node) => ({
    onAdd: () => setNodeEditor({ mode: 'create', parentId: node.id }),
    onEdit: () => setNodeEditor({ mode: 'edit', node }),
    onMove: () => { setMoveError(null); setMovingNode(node) },
    onDelete: () => setDeletingNode(node),
  })

  return (
    <div className="project-workspace">
      <header className="project-topbar">
        <button
          type="button"
          className="icon-action topbar-back"
          onClick={handleTopBack}
          aria-label={organizeMode ? '返回项目' : (nid ? '上一层' : '返回项目列表')}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="project-title">
          <span className={`status-pill status-${project.status}`}>{projectStatusLabel(project.status)}</span>
          <h1>{project.name}</h1>
          <span className="topbar-counts">{project.node_count} 个目录节点 · {project.entry_count} 条记录 · 未归档 {project.unarchived_entry_count}</span>
          <span className="topbar-path">{[project.name, ...path.map((item) => item.name)].join(' / ')}</span>
        </div>
        <div className="project-top-actions">
          <button
            type="button"
            className={`organize-toggle ${organizeMode ? 'secondary-button' : 'primary-button'}`}
            onClick={() => setOrganizeMode(!organizeMode)}
          >
            {organizeMode ? '回到查看' : '批量整理'}
          </button>
          {!organizeMode && (
            <>
              <button type="button" className="icon-action" onClick={() => setEditingProject(true)} aria-label="项目设置" title="项目设置"><Settings2 size={17} /></button>
              <button type="button" className="icon-action project-delete-action" onClick={() => setDeletingProject(true)} aria-label="删除项目" title="删除项目"><Trash2 size={17} /></button>
            </>
          )}
        </div>
      </header>

      {Boolean(moveError) && !movingNode && <div className="workspace-alert" role="alert">{mutationMessage(moveError, '节点移动失败，已重新加载目录')}</div>}

      <div className="desktop-directory">
        <aside className="directory-panel">
          <div className="directory-panel-head"><div><strong>知识目录</strong></div><button type="button" className="icon-action" aria-label="创建根节点" onClick={() => setNodeEditor({ mode: 'create', parentId: null })}><Plus size={17} /></button></div>
          {organizeMode && (
            <div className="tree-filter-options" role="group" aria-label="记录筛选">
              <button
                type="button"
                className={recordFilter === 'all' ? 'active' : ''}
                onClick={() => setRecordFilter('all')}
              >
                全部记录
              </button>
              <button
                type="button"
                className={recordFilter === 'unarchived' ? 'active' : ''}
                onClick={() => setRecordFilter('unarchived')}
              >
                未归档 ({project.unarchived_entry_count})
              </button>
            </div>
          )}
          {nodes.length === 0 ? (
            <div className="tree-empty"><Folder size={24} /><strong>知识目录为空</strong><span>手动创建节点，不会自动采用 AI 目录。</span><button type="button" className="primary-button" onClick={() => setNodeEditor({ mode: 'create', parentId: null })}>创建第一个节点</button></div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(event) => setActiveDragId(String(event.active.id))}
              onDragMove={handleDragMove}
              onDragCancel={() => { setActiveDragId(null); setDropPreview(null) }}
              onDragEnd={(event) => void handleDragEnd(event)}
            >
              <RootDropTarget dragging={Boolean(activeDragId)} />
              <SortableContext items={flatVisible.map((node) => node.id)} strategy={verticalListSortingStrategy}>
                <div className="tree-list" role="tree">
                  {flatVisible.map((node) => (
                    <SortableTreeRow
                      key={node.id}
                      treeNode={node}
                      node={node}
                      selected={organizeMode ? recordFilter === node.id : node.id === nid}
                      expanded={expanded.has(node.id)}
                      dropIntent={activeDragId && dropPreview?.overId === node.id && activeDragId !== node.id && dropPreview.intent !== 'root' ? dropPreview.intent : undefined}
                      onToggle={() => toggleExpanded(node.id)}
                      onSelect={() => {
                        if (!organizeMode) {
                          openNode(node.id)
                          return
                        }
                        setRecordFilter(recordFilter === node.id ? 'all' : node.id)
                      }}
                      {...nodeActions(node)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </aside>
        <main className="directory-content">
          <nav className="breadcrumbs" aria-label="节点路径"><button type="button" onClick={() => navigate(`/projects/${id}`)}>{project.name}</button>{path.map((item) => <span key={item.id}><ChevronRight size={13} /><button type="button" onClick={() => openNode(item.id)}>{item.name}</button></span>)}</nav>
          {organizeMode ? (
            <ProjectRecordsSection
              projectId={id}
              filter={recordFilter}
              onFilterChange={setRecordFilter}
            />
          ) : selectedNode ? (
            <>
              <section className="node-hero">
                <div>
                  <h2>
                    {selectedNode.name}
                    <button
                      type="button"
                      className="icon-action node-edit-inline"
                      aria-label="编辑节点"
                      title="编辑节点"
                      onClick={nodeActions(selectedNode).onEdit}
                    >
                      <Settings2 size={16} />
                    </button>
                  </h2>
                  {selectedNode.description && <p>{selectedNode.description}</p>}
                </div>
              </section>
              <section className="children-section"><header><h3>子节点</h3><span>{currentChildren.length} 个</span></header>{currentChildren.length ? <div className="child-list">{currentChildren.map((child) => <button type="button" key={child.id} onClick={() => openNode(child.id)}><Folder size={18} /><span><strong>{child.name}</strong><small>{child.description || '暂无说明'}</small></span><ChevronRight size={17} /></button>)}</div> : <div className="inline-empty"><Folder size={22} /><div><strong>还没有子节点</strong><span>手动创建节点，不会自动采用 AI 目录。</span></div></div>}</section>
              <NodeRecordsSection projectId={id} nodeId={selectedNode.id} />
            </>
          ) : (
            <section className="project-overview">
              <div className="overview-rule">
                <strong>{nodes.length} 个目录节点</strong>
                <span>{nodes.length ? '从左侧选择节点查看或维护子目录。' : '创建第一个节点后，目录将在此处展开。'}</span>
              </div>
            </section>
          )}
        </main>
      </div>

      <main className="mobile-directory">
        {organizeMode ? (
          <ProjectRecordsSection
            projectId={id}
            filter={recordFilter}
            onFilterChange={setRecordFilter}
            mobile
          />
        ) : (
          <>
            <button
              type="button"
              className="secondary-button mobile-unarchived-entry"
              onClick={() => navigate(`/projects/${id}?mode=organize&filter=unarchived`)}
            >
              未归档记录 {project.unarchived_entry_count} 条
            </button>
            {selectedNode && (
              <section className="mobile-node-head">
                <h2>
                  {selectedNode.name}
                  <button
                    type="button"
                    className="icon-action node-edit-inline"
                    aria-label="编辑节点"
                    onClick={nodeActions(selectedNode).onEdit}
                  >
                    <Settings2 size={16} />
                  </button>
                </h2>
                {selectedNode.description && <p>{selectedNode.description}</p>}
                <div className="mobile-node-actions">
                  <NodeMenu node={selectedNode} {...nodeActions(selectedNode)} ariaLabel="节点操作" />
                </div>
              </section>
            )}
            <section className="mobile-level"><header><div><h3>{selectedNode ? '子节点' : '根目录'}</h3><span>{currentChildren.length} {selectedNode ? '个子节点' : '个一级目录'}</span></div><button type="button" className="icon-action" aria-label={selectedNode ? '创建子节点' : '创建根节点'} onClick={() => setNodeEditor({ mode: 'create', parentId: selectedNode?.id ?? null })}><Plus size={18} /></button></header>
              {currentChildren.length ? <div className="mobile-level-list">{currentChildren.map((child) => <button type="button" key={child.id} onClick={() => openNode(child.id)}><Folder size={19} /><span><strong>{child.name}</strong><small>{child.description || '暂无说明'}</small></span>{child.entry_count > 0 && <span className="mobile-entry-count">{child.entry_count}</span>}<ChevronRight size={18} /></button>)}</div> : <div className="mobile-empty"><Folder size={24} /><strong>{selectedNode ? '还没有子节点' : '知识目录为空'}</strong><span>手动创建节点，不会自动采用 AI 目录。</span><button type="button" className="primary-button" onClick={() => setNodeEditor({ mode: 'create', parentId: selectedNode?.id ?? null })}>创建{selectedNode ? '子节点' : '第一个节点'}</button></div>}
            </section>
            {selectedNode && <NodeRecordsSection projectId={id} nodeId={selectedNode.id} />}
          </>
        )}
      </main>

      {nodeEditor && (
        <NodeDialog
          node={nodeEditor.mode === 'edit' ? nodeEditor.node : undefined}
          parentId={nodeEditor.mode === 'edit' ? nodeEditor.node.parent_id : nodeEditor.parentId}
          parentName={nodeEditor.mode === 'create' ? nodes.find((node) => node.id === nodeEditor.parentId)?.name : nodes.find((node) => node.id === nodeEditor.node.parent_id)?.name}
          pending={nodeEditor.mode === 'edit' ? updateNodeMutation.isPending : createNodeMutation.isPending}
          error={nodeEditor.mode === 'edit' ? updateNodeMutation.error : createNodeMutation.error}
          onClose={() => { setNodeEditor(null); createNodeMutation.reset(); updateNodeMutation.reset() }}
          onSubmit={saveNode}
        />
      )}
      {movingNode && <MoveNodeDialog node={movingNode} nodes={nodes} pending={moveMutation.isPending} error={moveError} onClose={() => { setMovingNode(null); setMoveError(null); moveMutation.reset() }} onSubmit={(input) => moveNode(movingNode.id, input.parent_id, input.position)} />}
      {deletingNode && <ConfirmDialog title={`删除“${deletingNode.name}”子树？`} description={`将永久删除 ${descendants(deletingNode.id, nodes).length + 1} 个目录节点，当前版本无法恢复。`} pending={deleteNodeMutation.isPending} error={deleteNodeMutation.error} onClose={() => { setDeletingNode(null); deleteNodeMutation.reset() }} onConfirm={confirmDeleteNode} />}
      {editingProject && <ProjectDialog project={project} pending={updateProjectMutation.isPending} error={updateProjectMutation.error} onClose={() => { setEditingProject(false); updateProjectMutation.reset() }} onSubmit={saveProject} />}
      {deletingProject && <ConfirmDialog title={`删除“${project.name}”项目？`} description="项目和全部目录节点将被永久删除。" confirmLabel="删除项目" pending={deleteProjectMutation.isPending} error={deleteProjectMutation.error} onClose={() => { setDeletingProject(false); deleteProjectMutation.reset() }} onConfirm={confirmDeleteProject} />}
    </div>
  )
}
