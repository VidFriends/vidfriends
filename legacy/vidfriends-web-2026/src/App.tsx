import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Layout } from './components/Layout'
import { FeedPage } from './pages/FeedPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { SendPage } from './pages/SendPage'
import { InboxPage } from './pages/InboxPage'
import { HistoryPage } from './pages/HistoryPage'
import { AdminPage } from './pages/AdminPage'
import { VideoPlayerPage } from './pages/VideoPlayerPage'
import { ProfilePage } from './pages/ProfilePage'
import { ImportCollectionPage } from './pages/ImportCollectionPage'
import { CollectionsIndexPage } from './pages/CollectionsIndexPage'
import { CollectionDetailPage } from './pages/CollectionDetailPage'

function LoadingScreen() {
  return (
    <div className="h-dvh flex items-center justify-center bg-gray-950">
      <div className="animate-spin h-10 w-10 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isReady } = useAuth()
  if (!isReady) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isReady } = useAuth()
  if (!isReady) return <LoadingScreen />
  if (isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, isReady } = useAuth()
  if (!isReady) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/send" element={<SendPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/videos/:id" element={<VideoPlayerPage />} />
        <Route path="/collections" element={<CollectionsIndexPage />} />
        <Route path="/collections/import" element={<ImportCollectionPage />} />
        <Route path="/collections/:id" element={<CollectionDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
