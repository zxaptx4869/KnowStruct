import {
  FolderKanban,
  Inbox,
  LogOut,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const navigation: NavItem[] = [
  { path: '/', label: '项目', icon: FolderKanban, end: true },
  { path: '/inbox', label: '采集', icon: Inbox },
  { path: '/search', label: '搜索', icon: Search },
  { path: '/me', label: '我的', icon: UserRound },
  { path: '/review', label: 'Review', icon: ShieldCheck },
]

export default function Layout() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await auth.logout()
      navigate('/login', { replace: true })
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <div className="brand-lockup sidebar-brand"><span className="brand-mark">KS</span><span>KnowStruct</span></div>
        <nav className="desktop-nav" aria-label="全局导航">
          {navigation.map(({ path, label, icon: Icon, end }) => (
            <NavLink key={path} to={path} end={end} className={({ isActive }) => `desktop-nav-item${isActive ? ' active' : ''}`}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-account">
          <div className="sidebar-user">
            <UserRound size={18} aria-hidden="true" />
            <span>{auth.user?.login_name}</span>
          </div>
          <button type="button" className="desktop-nav-item logout-button" onClick={handleLogout} disabled={loggingOut}>
            <LogOut size={18} aria-hidden="true" />
            <span>{loggingOut ? '正在退出' : '退出登录'}</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-header">
          <div className="brand-lockup"><span className="brand-mark">KS</span><span>KnowStruct</span></div>
        </header>
        <main className="content-area"><Outlet /></main>
        <nav className="mobile-tabs safe-bottom" aria-label="移动端导航">
          {navigation.map(({ path, label, icon: Icon, end }) => (
            <NavLink key={path} to={path} end={end} className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}>
              <span className="mobile-tab-icon"><Icon size={20} aria-hidden="true" /></span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
