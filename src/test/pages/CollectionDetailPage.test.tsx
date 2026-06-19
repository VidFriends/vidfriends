import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockCollection = { id: 'col-1', user_id: 'u1', name: 'Watch Later', video_count: 2, created_at: '2024-06-15T14:30:00Z', updated_at: '2024-06-15T14:30:00Z' }

const mockVideos = [
  { id: 'v1', user_id: 'u1', filename: 'cat-video.mp4', mimetype: 'video/mp4', size: 1000, duration: 120, created_at: '2024-06-15T14:30:00Z' },
  { id: 'v2', user_id: 'u1', filename: 'dog-video.mp4', mimetype: 'video/mp4', size: 2000, duration: 60, created_at: '2024-06-14T10:00:00Z' },
]

vi.mock('../../lib/api', () => ({
  api: {
    collections: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      get: vi.fn(),
      getVideos: vi.fn(),
      addVideo: vi.fn(),
      removeVideo: vi.fn(),
      importUrls: vi.fn(),
    },
    auth: { register: vi.fn(), login: vi.fn(), refresh: vi.fn(), me: vi.fn(), updateProfile: vi.fn() },
    videos: {
      like: vi.fn(), unlike: vi.fn(), getFeed: vi.fn(), getFypFeed: vi.fn(),
      getComments: vi.fn(), addComment: vi.fn(), getDetail: vi.fn(), create: vi.fn(),
      upload: vi.fn(), markWatched: vi.fn(),
    },
    history: { get: vi.fn() },
    inbox: { list: vi.fn(), markRead: vi.fn() },
    friends: { list: vi.fn(), send: vi.fn() },
    users: { getProfile: vi.fn(), getVideos: vi.fn() },
    admin: {
      getStats: vi.fn(), listUsers: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(),
      evictVideo: vi.fn(), runEviction: vi.fn(), getStorageBreakdown: vi.fn(), getActivityLog: vi.fn(),
    },
  },
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'testuser' }, isAuthenticated: true, isReady: true }),
}))

function renderDetail(Component: React.ComponentType, initialRoute: string) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/collections/:id" element={<Component />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CollectionDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.get).mockReturnValue(new Promise(() => {}))
    vi.mocked(api.collections.getVideos).mockReturnValue(new Promise(() => {}))
    const { CollectionDetailPage } = await import('../../pages/CollectionDetailPage')
    renderDetail(CollectionDetailPage, '/collections/col-1')

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders collection name and video count', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.get).mockResolvedValue({ collection: mockCollection })
    vi.mocked(api.collections.getVideos).mockResolvedValue({ videos: mockVideos })
    const { CollectionDetailPage } = await import('../../pages/CollectionDetailPage')
    renderDetail(CollectionDetailPage, '/collections/col-1')

    expect(await screen.findByText('Watch Later')).toBeInTheDocument()
    expect(screen.getByText('2 videos')).toBeInTheDocument()
  })

  it('renders video list', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.get).mockResolvedValue({ collection: mockCollection })
    vi.mocked(api.collections.getVideos).mockResolvedValue({ videos: mockVideos })
    const { CollectionDetailPage } = await import('../../pages/CollectionDetailPage')
    renderDetail(CollectionDetailPage, '/collections/col-1')

    expect(await screen.findByText('cat-video.mp4')).toBeInTheDocument()
    expect(screen.getByText('dog-video.mp4')).toBeInTheDocument()
  })

  it('shows empty state when no videos', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.get).mockResolvedValue({ collection: mockCollection })
    vi.mocked(api.collections.getVideos).mockResolvedValue({ videos: [] })
    const { CollectionDetailPage } = await import('../../pages/CollectionDetailPage')
    renderDetail(CollectionDetailPage, '/collections/col-1')

    expect(await screen.findByText('No videos in this collection')).toBeInTheDocument()
  })

  it('shows error when fetch fails', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.get).mockRejectedValueOnce(new Error('Not found'))
    const { CollectionDetailPage } = await import('../../pages/CollectionDetailPage')
    renderDetail(CollectionDetailPage, '/collections/col-bad')

    expect(await screen.findByText('Not found')).toBeInTheDocument()
  })

  it('opens rename form', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.get).mockResolvedValue({ collection: mockCollection })
    vi.mocked(api.collections.getVideos).mockResolvedValue({ videos: mockVideos })
    const user = userEvent.setup()
    const { CollectionDetailPage } = await import('../../pages/CollectionDetailPage')
    renderDetail(CollectionDetailPage, '/collections/col-1')

    await screen.findByText('Watch Later')
    await user.click(screen.getByText('Rename'))

    expect(screen.getByLabelText('Collection name')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Watch Later')).toBeInTheDocument()
  })

  it('shows delete confirmation', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.get).mockResolvedValue({ collection: mockCollection })
    vi.mocked(api.collections.getVideos).mockResolvedValue({ videos: mockVideos })
    const user = userEvent.setup()
    const { CollectionDetailPage } = await import('../../pages/CollectionDetailPage')
    renderDetail(CollectionDetailPage, '/collections/col-1')

    await screen.findByText('Watch Later')
    await user.click(screen.getByText('Delete'))

    expect(screen.getByText(/delete.*watch later/i)).toBeInTheDocument()
  })

  it('has back to collections link', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.get).mockResolvedValue({ collection: mockCollection })
    vi.mocked(api.collections.getVideos).mockResolvedValue({ videos: mockVideos })
    const { CollectionDetailPage } = await import('../../pages/CollectionDetailPage')
    renderDetail(CollectionDetailPage, '/collections/col-1')

    expect(await screen.findByText(/back to collections/i)).toBeInTheDocument()
  })
})
