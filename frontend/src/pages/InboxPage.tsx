import { useState } from 'react'

export default function InboxPage() {
  const [activeMode, setActiveMode] = useState<'text' | 'link' | 'image'>('text')

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">采集箱</h2>
      <p className="text-sm text-gray-500 mb-4">
        快速收集截图、链接、文字，稍后统一整理
      </p>

      {/* 输入模式切换 */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'text', label: '✏️ 文字' },
          { key: 'link', label: '🔗 链接' },
          { key: 'image', label: '📷 图片' },
        ].map((mode) => (
          <button
            key={mode.key}
            onClick={() => setActiveMode(mode.key as typeof activeMode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeMode === mode.key
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* 输入区域 */}
      {activeMode === 'text' && (
        <textarea
          className="w-full h-32 p-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-primary"
          placeholder="粘贴或输入文字..."
        />
      )}
      {activeMode === 'link' && (
        <input
          className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary"
          placeholder="粘贴网页链接..."
        />
      )}
      {activeMode === 'image' && (
        <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
          <span className="text-4xl mb-2">📷</span>
          <p className="text-sm text-gray-400">点击上传截图或图片</p>
        </div>
      )}

      <button className="mt-4 w-full py-3 bg-primary text-white rounded-xl text-sm font-medium">
        提交采集
      </button>

      {/* 已采集列表 */}
      <div className="mt-8">
        <h3 className="font-medium text-gray-900 mb-3">待整理</h3>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <p className="text-gray-400 text-sm text-center py-6">
            暂无采集项
          </p>
        </div>
      </div>
    </div>
  )
}
