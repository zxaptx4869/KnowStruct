import { FolderKanban, MoreHorizontal, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../projects/ConfirmDialog'
import ProjectDialog from '../projects/ProjectDialog'
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '../projects/queries'
import { projectStatusLabel, type Project, type ProjectInput } from '../projects/types'

function ProjectActions({ project, onEdit, onDelete }: { project: Project, onEdit: () => void, onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="row-actions" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="icon-action" aria-label={`管理 ${project.name}`} onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="action-menu">
          <button type="button" onClick={() => { setOpen(false); onEdit() }}>编辑项目</button>
          <button type="button" className="danger-text" onClick={() => { setOpen(false); onDelete() }}>删除项目</button>
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const projectsQuery = useProjects()
  const createMutation = useCreateProject()
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const updateMutation = useUpdateProject(editing && editing !== 'new' ? editing.id : '')
  const deleteMutation = useDeleteProject(deleting?.id ?? '')

  async function saveProject(input: ProjectInput) {
    try {
      if (editing === 'new') {
        const project = await createMutation.mutateAsync(input)
        setEditing(null)
        navigate(`/projects/${project.id}`)
      } else if (editing) {
        await updateMutation.mutateAsync(input)
        setEditing(null)
      }
    } catch {
      // Mutation state keeps the dialog open with the submitted values.
    }
  }

  async function confirmDelete() {
    try {
      await deleteMutation.mutateAsync()
      setDeleting(null)
    } catch {
      // Error remains visible in the confirmation dialog.
    }
  }

  const projects = projectsQuery.data ?? []
  return (
    <div className="projects-page">
      <header className="page-toolbar">
        <h1>项目</h1>
        <button
          type="button"
          className="primary-button toolbar-button create-project-fab"
          onClick={() => setEditing('new')}
          aria-label="创建项目"
        >
          <Plus size={16} />
          <span className="fab-label">创建项目</span>
        </button>
      </header>

      {projectsQuery.isPending && <div className="state-panel" role="status"><span className="spin state-spinner" />正在加载项目</div>}
      {projectsQuery.isError && (
        <div className="state-panel state-error" role="alert">
          <strong>项目加载失败</strong><span>请检查连接后重试，当前状态不代表工作区为空。</span>
          <button type="button" className="secondary-button" onClick={() => void projectsQuery.refetch()}><RefreshCw size={16} />重试</button>
        </div>
      )}
      {projectsQuery.isSuccess && projects.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><FolderKanban size={28} /></div>
          <h2>还没有项目</h2>
          <p>先建立一个知识主题，或从全局采集箱保存临时资料。点击「创建项目」开始。</p>
        </div>
      )}
      {projectsQuery.isSuccess && projects.length > 0 && (
        <>
          <div className="project-table-wrap desktop-projects">
            <table className="project-table">
              <thead><tr><th>项目</th><th>状态</th><th>目录节点</th><th>最近更新</th><th><span className="sr-only">操作</span></th></tr></thead>
              <tbody>{projects.map((project) => (
                <tr key={project.id} onClick={() => navigate(`/projects/${project.id}`)}>
                  <td>
                    <strong>{project.name}</strong>
                    <span className="project-goal">{project.goal || '暂未填写项目目标'}</span>
                    {project.summary && <span className="project-summary">{project.summary}</span>}
                  </td>
                  <td><span className={`status-pill status-${project.status}`}>{projectStatusLabel(project.status)}</span></td>
                  <td>{project.node_count} 个</td>
                  <td>{new Date(project.updated_at).toLocaleDateString('zh-CN')}</td>
                  <td><ProjectActions project={project} onEdit={() => setEditing(project)} onDelete={() => setDeleting(project)} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="mobile-projects">
            {projects.map((project) => (
              <article key={project.id} className="project-card" onClick={() => navigate(`/projects/${project.id}`)}>
                <div className="project-card-head"><h2>{project.name}</h2><ProjectActions project={project} onEdit={() => setEditing(project)} onDelete={() => setDeleting(project)} /></div>
                <p>{project.goal || '暂未填写项目目标'}</p>
                {project.summary && <p className="project-summary">{project.summary}</p>}
                <div className="project-card-meta"><span className={`status-pill status-${project.status}`}>{projectStatusLabel(project.status)}</span><span>{project.node_count} 个目录节点</span><span>{new Date(project.updated_at).toLocaleDateString('zh-CN')}</span></div>
              </article>
            ))}
          </div>
        </>
      )}

      {editing && (
        <ProjectDialog
          project={editing === 'new' ? undefined : editing}
          pending={editing === 'new' ? createMutation.isPending : updateMutation.isPending}
          error={editing === 'new' ? createMutation.error : updateMutation.error}
          onClose={() => { setEditing(null); createMutation.reset(); updateMutation.reset() }}
          onSubmit={saveProject}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`删除“${deleting.name}”项目？`}
          description="项目和其知识目录将被永久删除，当前版本无法恢复。"
          confirmLabel="删除项目"
          pending={deleteMutation.isPending}
          error={deleteMutation.error}
          onClose={() => { setDeleting(null); deleteMutation.reset() }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
