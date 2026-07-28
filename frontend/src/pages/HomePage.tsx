import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Project {
  id: string
  name: string
  goal: string
  status: string
  nodeCount: number
  updatedAt: string
}

export default function HomePage() {
  const navigate = useNavigate()
  const [projects] = useState<Project[]>([])

  return (
    <div className="p-4">
      {/* 欢迎区域 */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">我的项目</h2>
        <p className="mt-1 text-sm text-gray-500">
          管理你的知识经验项目
        </p>
      </div>

      {/* 项目列表 */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <span className="text-6xl mb-4">📋</span>
          <p className="text-base">还没有项目</p>
          <p className="text-sm mt-1">点击下方按钮创建第一个项目</p>
          <button
            onClick={() => navigate('/projects/new')}
            className="mt-6 px-6 py-3 bg-primary text-white rounded-xl text-sm font-medium"
          >
            创建新项目
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">{project.name}</h3>
                <span className="text-xs text-gray-400">{project.status}</span>
              </div>
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                {project.goal}
              </p>
              <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                <span>{project.nodeCount} 个节点</span>
                <span>{project.updatedAt}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
