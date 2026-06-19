import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockCollections = [
  { id: 'col-1', user_id: 'u1', name: 'Watch Later', video_count: 3, created_at: '2024-06-15T14:30:00Z', updated_at: '2024-06-15T14:30:00Z' },
  { id: 'col-2', user_id: 'u1', name: 'Favorites', video_count: 1, created_at: '2024-06-14T10:00:00Z', updated_at: '2024-06-14T10:00:00Z' },
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

describe('CollectionsIndexPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.list).mockResolvedValue({ collections: [] })
    const { CollectionsIndexPage } = await import('../../pages/CollectionsIndexPage')
    render(<MemoryRouter><CollectionsIndexPage /></MemoryRouter>)

    expect(await screen.findByText('Collections')).toBeInTheDocument()
  })

  it('shows loading spinner initially', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.list).mockReturnValue(new Promise(() => {}))
    const { CollectionsIndexPage } = await import('../../pages/CollectionsIndexPage')
    render(<MemoryRouter><CollectionsIndexPage /></MemoryRouter>)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows empty state when no collections', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.list).mockResolvedValue({ collections: [] })
    const { CollectionsIndexPage } = await import('../../pages/CollectionsIndexPage')
    render(<MemoryRouter><CollectionsIndexPage /></MemoryRouter>)

    expect(await screen.findByText('No collections yet')).toBeInTheDocument()
  })

  it('renders list of collections', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.list).mockResolvedValue({ collections: mockCollections })
    const { CollectionsIndexPage } = await import('../../pages/CollectionsIndexPage')
    render(<MemoryRouter><CollectionsIndexPage /></MemoryRouter>)

    expect(await screen.findByText('Watch Later')).toBeInTheDocument()
    expect(screen.getByText('Favorites')).toBeInTheDocument()
    expect(screen.getByText('3 videos')).toBeInTheDocument()
    expect(screen.getByText('1 video')).toBeInTheDocument()
  })

  it('shows error when fetch fails', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.list).mockRejectedValueOnce(new Error('Failed to load'))
    const { CollectionsIndexPage } = await import('../../pages/CollectionsIndexPage')
    render(<MemoryRouter><CollectionsIndexPage /></MemoryRouter>)

    expect(await screen.findByText('Failed to load')).toBeInTheDocument()
  })

  it('opens create form when clicking New Collection', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.list).mockResolvedValue({ collections: [] })
    const user = userEvent.setup()
    const { CollectionsIndexPage } = await import('../../pages/CollectionsIndexPage')
    render(<MemoryRouter><CollectionsIndexPage /></MemoryRouter>)

    await screen.findByText('Collections')
    await user.click(screen.getByText('New Collection'))

    expect(screen.getByLabelText('Collection name')).toBeInTheDocument()
  })

  it('creates a new collection', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.list).mockResolvedValue({ collections: [] })
    vi.mocked(api.collections.create).mockResolvedValue({ collection: mockCollections[0] })
    const user = userEvent.setup()
    const { CollectionsIndexPage } = await import('../../pages/CollectionsIndexPage')
    render(<MemoryRouter><CollectionsIndexPage /></MemoryRouter>)

    await screen.findByText('Collections')
    await user.click(screen.getByText('New Collection'))
    await user.type(screen.getByLabelText('Collection name'), 'Test Collection')
    await user.click(screen.getByText('Create'))

    expect(api.collections.create).toHaveBeenCalledWith('Test Collection')
  })
})
