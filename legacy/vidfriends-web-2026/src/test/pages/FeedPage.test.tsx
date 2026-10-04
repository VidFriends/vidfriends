import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockVideos = [
  {
    id: 'v1',
    user_id: 'u1',
    title: 'Video one',
    description: 'First video',
    file_url: 'https://example.com/1.mp4',
    user_name: 'alice',
    like_count: 10,
    comment_count: 3,
    liked: false,
    status: 'ready' as const,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'v2',
    user_id: 'u2',
    title: 'Video two',
    description: 'Second video',
    file_url: 'https://example.com/2.mp4',
    user_name: 'bob',
    like_count: 5,
    comment_count: 1,
    liked: true,
    status: 'ready' as const,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
]

const mockGetFypFeed = vi.fn()
const mockGetFeed = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    videos: {
      getFypFeed: mockGetFypFeed,
      getFeed: mockGetFeed,
      like: vi.fn(),
      unlike: vi.fn(),
      markWatched: vi.fn(),
      getComments: vi.fn(),
      addComment: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn(),
      upload: vi.fn(),
    },
    auth: { register: vi.fn(), login: vi.fn(), refresh: vi.fn(), me: vi.fn(), updateProfile: vi.fn() },
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

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn()
    disconnect = vi.fn()
    unobserve = vi.fn()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FeedPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    HTMLVideoElement.prototype.pause = vi.fn()
    HTMLVideoElement.prototype.addEventListener = vi.fn()
    HTMLVideoElement.prototype.removeEventListener = vi.fn()
    HTMLVideoElement.prototype.load = vi.fn()
  })

  it('shows loading state initially', async () => {
    mockGetFypFeed.mockImplementationOnce(() => new Promise(() => {}))
    const { FeedPage } = await import('../../pages/FeedPage')
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Loading feed...')).toBeInTheDocument()
  })

  it('renders FYP feed with videos', async () => {
    mockGetFypFeed.mockResolvedValueOnce(mockVideos)
    const { FeedPage } = await import('../../pages/FeedPage')
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Video one')).toBeInTheDocument()
    expect(screen.getByText('Video two')).toBeInTheDocument()
  })

  it('switches to Discover tab and shows discover feed', async () => {
    mockGetFypFeed.mockResolvedValueOnce(mockVideos)
    mockGetFeed.mockResolvedValueOnce([
      { ...mockVideos[0], id: 'v3', title: 'Discover video', user_name: 'charlie' },
    ])
    const { FeedPage } = await import('../../pages/FeedPage')
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Video one')).toBeInTheDocument()

    const discoverBtn = screen.getByText('Discover')
    await user.click(discoverBtn)

    expect(await screen.findByText('Discover video')).toBeInTheDocument()
  })

  it('shows empty state when no videos', async () => {
    mockGetFypFeed.mockResolvedValueOnce([])
    mockGetFeed.mockResolvedValueOnce([])
    const { FeedPage } = await import('../../pages/FeedPage')
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('No videos yet')).toBeInTheDocument()
  })

  it('shows error state and allows retry', async () => {
    mockGetFypFeed.mockRejectedValueOnce(new Error('Network error'))
    mockGetFeed.mockRejectedValueOnce(new Error('Network error'))
    const { FeedPage } = await import('../../pages/FeedPage')
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Network error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('renders tab buttons with active state', async () => {
    mockGetFypFeed.mockResolvedValueOnce(mockVideos)
    const { FeedPage } = await import('../../pages/FeedPage')
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    await screen.findByText('Video one')

    expect(screen.getByText('For You')).toBeInTheDocument()
    expect(screen.getByText('Discover')).toBeInTheDocument()
  })

  it('falls back to discover when FYP is empty', async () => {
    mockGetFypFeed.mockResolvedValueOnce([])
    mockGetFeed.mockResolvedValue(mockVideos)
    const { FeedPage } = await import('../../pages/FeedPage')
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Video one')).toBeInTheDocument()
    expect(screen.getByText('Video two')).toBeInTheDocument()
  })

  it('falls back to discover when FYP errors', async () => {
    mockGetFypFeed.mockRejectedValueOnce(new Error('FYP error'))
    mockGetFeed.mockResolvedValue(mockVideos)
    const { FeedPage } = await import('../../pages/FeedPage')
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Video one')).toBeInTheDocument()
  })

  it('has refresh button', async () => {
    mockGetFypFeed.mockResolvedValueOnce(mockVideos)
    mockGetFypFeed.mockResolvedValueOnce(mockVideos)
    const { FeedPage } = await import('../../pages/FeedPage')
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    )

    await screen.findByText('Video one')

    const refreshBtn = screen.getByRole('button', { name: /refresh feed/i })
    await user.click(refreshBtn)

    expect(mockGetFypFeed).toHaveBeenCalledTimes(2)
  })
})
