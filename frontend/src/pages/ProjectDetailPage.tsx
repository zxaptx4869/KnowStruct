import { useNavigate } from 'react-router-dom'

export default function ProjectDetailPage() {
  const navigate = useNavigate()

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-500 text-lg"
        >
          ←
        </button>
        <h2 className="text-xl font-bold text-gray-900">项目详情</h2>
      </div>

      {/* 标签切换：目录 / 资料 / 记录 / 决策 / 问题 */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {['目录', '资料', '记录', '决策', '问题'].map((tab) => (
          <button
            key={tab}
            className="px-4 py-1.5 rounded-full text-sm bg-gray-100 text-gray-600"
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 知识目录树占位 */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <p className="text-gray-400 text-sm text-center py-10">
          知识目录树 — 待实现
        </p>
      </div>

      {/* AI 起草目录按钮 */}
      <button className="mt-4 w-full py-3 bg-primary text-white rounded-xl text-sm font-medium">
        🤖 AI 起草目录
      </button>
    </div>
  )
}
