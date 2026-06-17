import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEntries = [
  {
    id: 'h1',
    title: 'Funny cats',
    thumbnail_url: 'https://example.com/cat.jpg',
    user_name: 'alice',
    watched_at: '2024-06-15T14:30:00Z',
    progress_seconds: 45,
  },
  {
    id: 'h2',
    title: 'Dancing dogs',
    user_name: 'bob',
    watched_at: '2024-06-14T10:00:00Z',
    progress_seconds: 120,
  },
  {
    id: 'h3',
    title: 'Cooking tutorial',
    thumbnail_url: 'https://example.com/cook.jpg',
    user_name: 'charlie',
    watched_at: '2024-05-01T08:00:00Z',
    progress_seconds: 300,
  },
]

vi.mock('../../lib/api', () => ({
  api: {
    history: {
      get: vi.fn(),
    },
    auth: { register: vi.fn(), login: vi.fn(), refresh: vi.fn(), me: vi.fn(), updateProfile: vi.fn() },
    videos: {
      like: vi.fn(), unlike: vi.fn(), getFeed: vi.fn(), getFypFeed: vi.fn(),
      getComments: vi.fn(), addComment: vi.fn(), getDetail: vi.fn(), create: vi.fn(),
      upload: vi.fn(), markWatched: vi.fn(),
    },
    inbox: { list: vi.fn(), markRead: vi.fn() },
    friends: { list: vi.fn(), send: vi.fn() },
    users: { getProfile: vi.fn(), getVideos: vi.fn() },
    admin: {
      getStats: vi.fn(), listUsers: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(),
      evictVideo: vi.fn(), runEviction: vi.fn(), getStorageBreakdown: vi.fn(), getActivityLog: vi.fn(),
    },
  },
}))

describe('HistoryPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../../lib/api')
    vi.mocked(api.history.get).mockResolvedValue(mockEntries)
  })

  it('renders history entries after loading', async () => {
    const { HistoryPage } = await import('../../pages/HistoryPage')
    render(<HistoryPage />)

    expect(await screen.findByText('Funny cats')).toBeInTheDocument()
    expect(screen.getByText('Dancing dogs')).toBeInTheDocument()
    expect(screen.getByText('Cooking tutorial')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('filters by search query', async () => {
    const { HistoryPage } = await import('../../pages/HistoryPage')
    const user = userEvent.setup()
    render(<HistoryPage />)

    await screen.findByText('Funny cats')

    const searchInput = screen.getByLabelText(/search history/i)
    await user.type(searchInput, 'dancing')

    expect(screen.getByText('Dancing dogs')).toBeInTheDocument()
    expect(screen.queryByText('Funny cats')).not.toBeInTheDocument()
    expect(screen.queryByText('Cooking tutorial')).not.toBeInTheDocument()
  })

  it('filters by date range', async () => {
    const { HistoryPage } = await import('../../pages/HistoryPage')
    const user = userEvent.setup()
    render(<HistoryPage />)

    await screen.findByText('Funny cats')

    const dateFrom = screen.getByLabelText(/from date/i) as HTMLInputElement
    await user.clear(dateFrom)
    await user.type(dateFrom, '2024-06-01')

    expect(screen.getByText('Funny cats')).toBeInTheDocument()
    expect(screen.getByText('Dancing dogs')).toBeInTheDocument()
    expect(screen.queryByText('Cooking tutorial')).not.toBeInTheDocument()
  })

  it('shows empty state when no matches', async () => {
    const { HistoryPage } = await import('../../pages/HistoryPage')
    const user = userEvent.setup()
    render(<HistoryPage />)

    await screen.findByText('Funny cats')

    const searchInput = screen.getByLabelText(/search history/i)
    await user.type(searchInput, 'nonexistent')

    expect(screen.getByText('No watch history found')).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.history.get).mockRejectedValueOnce(new Error('Failed to load'))
    const { HistoryPage } = await import('../../pages/HistoryPage')
    render(<HistoryPage />)

    expect(await screen.findByText('Failed to load')).toBeInTheDocument()
  })

  it('renders result count', async () => {
    const { HistoryPage } = await import('../../pages/HistoryPage')
    render(<HistoryPage />)

    expect(await screen.findByText('3 results')).toBeInTheDocument()
  })

  it('paginates entries', async () => {
    const manyEntries = Array.from({ length: 12 }, (_, i) => ({
      id: `h${i}`,
      title: `Video ${i + 1}`,
      user_name: `user${i}`,
      watched_at: '2024-06-15T14:30:00Z',
      progress_seconds: 30,
    }))
    const { api } = await import('../../lib/api')
    vi.mocked(api.history.get).mockResolvedValueOnce(manyEntries)
    const { HistoryPage } = await import('../../pages/HistoryPage')
    const user = userEvent.setup()
    render(<HistoryPage />)

    expect(await screen.findByText('Video 1')).toBeInTheDocument()
    expect(screen.queryByText('Video 11')).not.toBeInTheDocument()

    const nextBtn = screen.getByRole('button', { name: /next/i })
    await user.click(nextBtn)

    expect(screen.getByText('Video 11')).toBeInTheDocument()
    expect(screen.queryByText('Video 1')).not.toBeInTheDocument()
  })
})
