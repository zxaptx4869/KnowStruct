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
  Folder,
  FolderOpen,
  GripVertical,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../projects/ConfirmDialog'
import MoveNodeDialog from '../projects/MoveNodeDialog'
import NodeDialog from '../projects/NodeDialog'
import ProjectDialog from '../projects/ProjectDialog'
import { mutationMessage } from '../projects/errors'
import {
  useCreateNode,
  useDeleteNode,
  useDeleteProject,
  useMoveNode,
  useNodes,
  useProject,
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

interface NodeMenuProps {
  node: Node
  onAdd: () => void
  onEdit: () => void
  onMove: () => void
  onDelete: () => void
  ariaLabel?: string
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

type NodeEditor = { mode: 'create', parentId: string | null } | { mode: 'edit', node: Node }

export default function ProjectDetailPage() {
  const { id = '', nid } = useParams<{ id: string, nid?: string }>()
  const navigate = useNavigate()
  const projectQuery = useProject(id)
  const nodesQuery = useNodes(id)
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
        <button type="button" className="icon-action desktop-back" onClick={() => navigate('/')} aria-label="返回项目列表"><ArrowLeft size={18} /></button>
        <div className="project-title"><span className={`status-pill status-${project.status}`}>{projectStatusLabel(project.status)}</span><h1>{project.name}</h1><span>{project.node_count} 个目录节点</span></div>
        <div className="project-top-actions">
          <button type="button" className="icon-action" onClick={() => setEditingProject(true)} aria-label="项目设置" title="项目设置"><Settings2 size={17} /></button>
          <button type="button" className="icon-action project-delete-action" onClick={() => setDeletingProject(true)} aria-label="删除项目" title="删除项目"><Trash2 size={17} /></button>
        </div>
      </header>

      {Boolean(moveError) && !movingNode && <div className="workspace-alert" role="alert">{mutationMessage(moveError, '节点移动失败，已重新加载目录')}</div>}

      <div className="desktop-directory">
        <aside className="directory-panel">
          <div className="directory-panel-head"><div><strong>知识目录</strong></div><button type="button" className="icon-action" aria-label="创建根节点" onClick={() => setNodeEditor({ mode: 'create', parentId: null })}><Plus size={17} /></button></div>
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
                      selected={node.id === nid}
                      expanded={expanded.has(node.id)}
                      dropIntent={activeDragId && dropPreview?.overId === node.id && activeDragId !== node.id && dropPreview.intent !== 'root' ? dropPreview.intent : undefined}
                      onToggle={() => toggleExpanded(node.id)}
                      onSelect={() => openNode(node.id)}
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
          {selectedNode ? (
            <>
              <section className="node-hero"><div><h2>{selectedNode.name}</h2><p>{selectedNode.description || '还没有节点说明。'}</p></div><div className="node-actions"><button type="button" className="secondary-button" onClick={nodeActions(selectedNode).onEdit}>编辑节点</button><button type="button" className="primary-button" onClick={nodeActions(selectedNode).onAdd}><Plus size={16} />创建子节点</button></div></section>
              <section className="children-section"><header><h3>子节点</h3><span>{currentChildren.length} 个</span></header>{currentChildren.length ? <div className="child-list">{currentChildren.map((child) => <button type="button" key={child.id} onClick={() => openNode(child.id)}><Folder size={18} /><span><strong>{child.name}</strong><small>{child.description || '暂无说明'}</small></span><ChevronRight size={17} /></button>)}</div> : <div className="inline-empty"><Folder size={22} /><div><strong>还没有子节点</strong><span>手动创建节点，不会自动采用 AI 目录。</span></div></div>}</section>
            </>
          ) : (
            <section className="project-overview"><h2>{project.name}</h2><p>{project.goal || '还没有填写项目目标。'}</p><div className="overview-rule"><strong>{nodes.length} 个目录节点</strong><span>{nodes.length ? '从左侧选择节点查看或维护子目录。' : '创建第一个节点后，目录将在此处展开。'}</span></div></section>
          )}
        </main>
      </div>

      <main className="mobile-directory">
        <nav className="mobile-breadcrumbs" aria-label="节点路径">
          <button type="button" onClick={() => nid ? navigate(path.length > 1 ? `/projects/${id}/nodes/${path[path.length - 2].id}` : `/projects/${id}`) : navigate('/')}><ArrowLeft size={17} />{nid ? '上一层' : '项目列表'}</button>
          <span>{[project.name, ...path.map((item) => item.name)].join(' / ')}</span>
        </nav>
        <section className="mobile-node-head"><h2>{selectedNode?.name ?? project.name}</h2><p>{selectedNode ? selectedNode.description || '还没有节点说明。' : project.goal || '还没有填写项目目标。'}</p>{selectedNode && <div className="mobile-node-actions"><button type="button" className="secondary-button" onClick={nodeActions(selectedNode).onEdit}>编辑节点</button><NodeMenu node={selectedNode} {...nodeActions(selectedNode)} ariaLabel="节点操作" /></div>}</section>
        <section className="mobile-level"><header><div><h3>{selectedNode ? '子节点' : '根目录'}</h3><span>{currentChildren.length} {selectedNode ? '个子节点' : '个一级目录'}</span></div><button type="button" className="icon-action" aria-label={selectedNode ? '创建子节点' : '创建根节点'} onClick={() => setNodeEditor({ mode: 'create', parentId: selectedNode?.id ?? null })}><Plus size={18} /></button></header>
          {currentChildren.length ? <div className="mobile-level-list">{currentChildren.map((child) => <button type="button" key={child.id} onClick={() => openNode(child.id)}><Folder size={19} /><span><strong>{child.name}</strong><small>{child.description || '暂无说明'}</small></span><ChevronRight size={18} /></button>)}</div> : <div className="mobile-empty"><Folder size={24} /><strong>{selectedNode ? '还没有子节点' : '知识目录为空'}</strong><span>手动创建节点，不会自动采用 AI 目录。</span><button type="button" className="primary-button" onClick={() => setNodeEditor({ mode: 'create', parentId: selectedNode?.id ?? null })}>创建{selectedNode ? '子节点' : '第一个节点'}</button></div>}
        </section>
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
