import { Outlet, NavLink, useLocation } from 'react-router-dom'

const tabs = [
  { path: '/', label: '项目', icon: '📁' },
  { path: '/inbox', label: '采集', icon: '📥' },
  { path: '/search', label: '搜索', icon: '🔍' },
  { path: '/review', label: 'Review', icon: '🔎' },
]

export default function Layout() {
  const location = useLocation()

  // 不在节点详情页显示底部 Tab（因为它在项目详情内）
  const showTabs = !location.pathname.includes('/nodes/')

  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 safe-top">
        <div className="flex items-center justify-between h-12 px-4">
          <h1 className="text-lg font-semibold text-gray-900">
            KnowStruct
          </h1>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* 底部 Tab 导航（移动端） */}
      {showTabs && (
        <nav className="sticky bottom-0 z-50 bg-white border-t border-gray-200 safe-bottom">
          <div className="flex items-center justify-around h-14">
            {tabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.path === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 px-3 py-1 text-xs ${
                    isActive
                      ? 'text-primary font-medium'
                      : 'text-gray-500'
                  }`
                }
              >
                <span className="text-xl">{tab.icon}</span>
                <span>{tab.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
