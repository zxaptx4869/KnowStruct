import {
  ChevronDown,
  ChevronUp,
  FolderKanban,
  FolderOpen,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNodes, useProjects } from '../projects/queries'
import type { ReviewScopeSelection } from './types'

interface ScopePickerProps {
  value: ReviewScopeSelection
  onChange: (value: ReviewScopeSelection) => void
}

export default function ScopePicker({ value, onChange }: ScopePickerProps) {
  const [open, setOpen] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const projectsQuery = useProjects()
  const nodesQuery = useNodes(expandedProject ?? '')
  const labelNodesQuery = useNodes(value.project_id ?? '')

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const projects = projectsQuery.data ?? []
  const nodes = nodesQuery.data ?? []
  const projectName = projects.find((item) => item.id === value.project_id)?.name
  const nodeName = labelNodesQuery.data?.find(
    (item) => item.id === value.node_id,
  )?.name
  const selectedLabel = value.project_id
    ? value.node_id && nodeName
      ? `${projectName ?? ''} / ${nodeName}`
      : (projectName ?? '请选择审查范围')
    : '请选择审查范围'

  function selectProject(projectId: string) {
    onChange({ project_id: projectId, node_id: null })
    setOpen(false)
  }

  function selectNode(projectId: string, nodeId: string) {
    onChange({ project_id: projectId, node_id: nodeId })
    setOpen(false)
  }

  function renderNodes(parentId: string | null, depth: number) {
    return nodes
      .filter((node) => node.parent_id === parentId)
      .map((node) => (
        <div key={node.id}>
          <button
            type="button"
            className="review-scope-item child"
            style={{ paddingLeft: `${14 + depth * 18}px` }}
            onClick={() => selectNode(expandedProject!, node.id)}
          >
            <span>{node.name}</span>
            <span className="review-scope-scope">节点</span>
          </button>
          {renderNodes(node.id, depth + 1)}
        </div>
      ))
  }

  return (
    <div className="review-scope-picker" ref={rootRef}>
      <button
        type="button"
        className="review-scope-trigger"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {value.node_id ? (
          <FolderOpen size={14} aria-hidden="true" />
        ) : (
          <FolderKanban size={14} aria-hidden="true" />
        )}
        <span>{selectedLabel}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <div className="review-scope-panel" role="listbox" aria-label="选择审查范围">
          {projects.map((project) => {
            const expanded = expandedProject === project.id
            return (
              <div key={project.id} className="review-scope-group">
                <div className="review-scope-row">
                  <button
                    type="button"
                    className="review-scope-item"
                    onClick={() => selectProject(project.id)}
                  >
                    <span>{project.name}</span>
                    <span className="review-scope-scope">项目</span>
                  </button>
                  <button
                    type="button"
                    className="review-scope-expand"
                    aria-label={`展开 ${project.name}`}
                    onClick={() =>
                      setExpandedProject(expanded ? null : project.id)
                    }
                  >
                    {expanded ? (
                      <ChevronUp size={14} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={14} aria-hidden="true" />
                    )}
                  </button>
                </div>
                {expanded && (
                  <div className="review-scope-children">
                    {nodes.length === 0 ? (
                      <div className="review-scope-empty">该项目暂无节点</div>
                    ) : (
                      renderNodes(null, 0)
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
