import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetStats = vi.fn()
const mockListUsers = vi.fn()
const mockGetStorageBreakdown = vi.fn()
const mockGetActivityLog = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      getStats: mockGetStats,
      listUsers: mockListUsers,
      getStorageBreakdown: mockGetStorageBreakdown,
      getActivityLog: mockGetActivityLog,
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
      evictVideo: vi.fn(),
      runEviction: vi.fn(),
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
  },
}))

const mockStats = {
  total_videos: 150,
  total_users: 42,
  total_likes: 999,
  total_comments: 500,
  total_storage_bytes: 1_073_741_824,
  storage_quota_bytes: 10_737_418_240,
  storage_usage_pct: 10,
}

const mockUsers = [
  {
    id: 'u1', email: 'alice@test.com', username: 'alice', role: 'admin',
    status: 'active', storage_used: 524288, upload_quota_bytes: null, created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'u2', email: 'bob@test.com', username: 'bob', role: 'user',
    status: 'active', storage_used: 1048576, upload_quota_bytes: 5_368_709_120, created_at: '2024-03-15T00:00:00Z',
  },
]

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStats.mockResolvedValue(mockStats)
    mockListUsers.mockResolvedValue(mockUsers)
    mockGetStorageBreakdown.mockResolvedValue([
      { user_id: 'u1', username: 'alice', storage_used: 524288 },
      { user_id: 'u2', username: 'bob', storage_used: 1048576 },
    ])
    mockGetActivityLog.mockResolvedValue({ entries: [], total: 0, limit: 50, offset: 0 })
  })

  it('renders admin dashboard heading after loading', async () => {
    const { AdminPage } = await import('../../pages/AdminPage')
    render(<AdminPage />)

    expect(await screen.findByRole('heading', { name: /admin dashboard/i })).toBeInTheDocument()
  })

  it('shows error state when data fails to load', async () => {
    mockGetStats.mockRejectedValueOnce(new Error('Unauthorized'))
    const { AdminPage } = await import('../../pages/AdminPage')
    render(<AdminPage />)

    expect(await screen.findByText('Unauthorized')).toBeInTheDocument()
  })

  it('renders overview tab with stats by default', async () => {
    const { AdminPage } = await import('../../pages/AdminPage')
    render(<AdminPage />)

    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders all tab buttons', async () => {
    const { AdminPage } = await import('../../pages/AdminPage')
    render(<AdminPage />)

    await screen.findByText('Admin Dashboard')

    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /storage/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /eviction policy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /activity log/i })).toBeInTheDocument()
  })

  it('switches to users tab and renders user list', async () => {
    const { AdminPage } = await import('../../pages/AdminPage')
    const user = userEvent.setup()
    render(<AdminPage />)

    const usersBtn = await screen.findByRole('button', { name: /users/i })
    await user.click(usersBtn)

    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('switches to storage tab and shows storage breakdown', async () => {
    const { AdminPage } = await import('../../pages/AdminPage')
    const user = userEvent.setup()
    render(<AdminPage />)

    const storageBtn = await screen.findByRole('button', { name: /storage/i })
    await user.click(storageBtn)

    expect(await screen.findByText('Storage Breakdown')).toBeInTheDocument()
  })

  it('switches to eviction tab', async () => {
    const { AdminPage } = await import('../../pages/AdminPage')
    const user = userEvent.setup()
    render(<AdminPage />)

    const evictionBtn = await screen.findByRole('button', { name: /eviction policy/i })
    await user.click(evictionBtn)

    expect(await screen.findByText('Run Bulk Eviction')).toBeInTheDocument()
    expect(screen.getByText('Single Video Eviction')).toBeInTheDocument()
  })

  it('switches to activity tab and loads activity data', async () => {
    mockGetActivityLog.mockResolvedValueOnce({
      entries: [{ id: 'a1', actor_id: 'admin', action: 'admin_update_user', entity_type: 'user', entity_id: 'u1', created_at: '2024-06-01T00:00:00Z' }],
      total: 1, limit: 50, offset: 0,
    })
    const { AdminPage } = await import('../../pages/AdminPage')
    const user = userEvent.setup()
    render(<AdminPage />)

    const activityBtn = await screen.findByRole('button', { name: /activity log/i })
    await user.click(activityBtn)

    expect(await screen.findByRole('heading', { name: /activity log/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument()
  })

  it('renders stat cards with storage info', async () => {
    const { AdminPage } = await import('../../pages/AdminPage')
    render(<AdminPage />)

    expect(await screen.findByText('Total Videos')).toBeInTheDocument()
    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getByText('Total Storage')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
  })
})
