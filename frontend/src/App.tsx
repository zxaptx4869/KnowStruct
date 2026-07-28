import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import NodeDetailPage from './pages/NodeDetailPage'
import InboxPage from './pages/InboxPage'
import SearchPage from './pages/SearchPage'
import ReviewPage from './pages/ReviewPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:id/nodes/:nid" element={<NodeDetailPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/review" element={<ReviewPage />} />
      </Route>
    </Routes>
  )
}
