import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import { ProtectedRoute, PublicOnlyRoute } from './components/AuthRoutes'
import HomePage from './pages/HomePage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import NodeDetailPage from './pages/NodeDetailPage'
import InboxPage from './pages/InboxPage'
import SearchPage from './pages/SearchPage'
import ReviewPage from './pages/ReviewPage'
import LoginPage from './pages/LoginPage'
import MePage from './pages/MePage'

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:id/nodes/:nid" element={<NodeDetailPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/me" element={<MePage />} />
        </Route>
      </Route>
    </Routes>
  )
}
