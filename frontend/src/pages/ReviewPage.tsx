export default function ReviewPage() {
  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">AI Review</h2>
      <p className="text-sm text-gray-500 mb-4">
        AI 审查帮你发现重复、冲突、缺失和过期的信息
      </p>

      {/* Review 操作按钮 */}
      <button className="w-full py-3 bg-primary text-white rounded-xl text-sm font-medium">
        🔍 开始审查
      </button>

      {/* Review 结果列表 */}
      <div className="mt-8">
        <h3 className="font-medium text-gray-900 mb-3">审查结果</h3>

        <div className="space-y-3">
          {/* 审查结果占位 */}
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <h4 className="text-sm font-medium text-gray-900">冲突发现</h4>
                <p className="text-xs text-gray-500 mt-1">
                  AI Review 结果将在这里展示
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
