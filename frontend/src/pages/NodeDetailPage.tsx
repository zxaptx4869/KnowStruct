import { useNavigate } from 'react-router-dom'

export default function NodeDetailPage() {
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
        <h2 className="text-xl font-bold text-gray-900">节点详情</h2>
      </div>

      {/* 节点内容区 */}
      <div className="space-y-3">
        {/* 注意事项 */}
        <section className="bg-white rounded-xl p-4 border border-gray-100">
          <h3 className="font-medium text-gray-900 mb-2">📝 注意事项</h3>
          <p className="text-gray-400 text-sm text-center py-6">暂无内容</p>
        </section>

        {/* 经验记录 */}
        <section className="bg-white rounded-xl p-4 border border-gray-100">
          <h3 className="font-medium text-gray-900 mb-2">💡 经验记录</h3>
          <p className="text-gray-400 text-sm text-center py-6">暂无内容</p>
        </section>

        {/* 候选型号 / 商品 */}
        <section className="bg-white rounded-xl p-4 border border-gray-100">
          <h3 className="font-medium text-gray-900 mb-2">🛒 候选型号</h3>
          <p className="text-gray-400 text-sm text-center py-6">暂无内容</p>
        </section>

        {/* 价格记录 */}
        <section className="bg-white rounded-xl p-4 border border-gray-100">
          <h3 className="font-medium text-gray-900 mb-2">💰 价格记录</h3>
          <p className="text-gray-400 text-sm text-center py-6">暂无内容</p>
        </section>

        {/* 最终决策 */}
        <section className="bg-white rounded-xl p-4 border border-gray-100">
          <h3 className="font-medium text-gray-900 mb-2">✅ 最终选择</h3>
          <p className="text-gray-400 text-sm text-center py-6">暂无内容</p>
        </section>
      </div>

      {/* AI 拓展按钮 */}
      <button className="mt-4 w-full py-3 bg-primary text-white rounded-xl text-sm font-medium">
        🤖 AI 拓展此节点
      </button>
    </div>
  )
}
