export default function SearchPage() {
  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">搜索</h2>

      <div className="relative">
        <input
          className="w-full p-3 pl-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary"
          placeholder="搜索节点、记录、经验..."
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          🔍
        </span>
      </div>

      {/* 搜索结果占位 */}
      <div className="mt-8">
        <p className="text-gray-400 text-sm text-center py-10">
          输入关键词开始搜索
        </p>
      </div>
    </div>
  )
}
