import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthProvider } from '../../context/AuthContext'
import { Layout } from '../../components/Layout'

const { mockMe } = vi.hoisted(() => ({
  mockMe: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    auth: { me: mockMe, register: vi.fn(), login: vi.fn(), refresh: vi.fn(), updateProfile: vi.fn() },
    videos: {
      getFypFeed: vi.fn(), getFeed: vi.fn(), getDetail: vi.fn(), like: vi.fn(), unlike: vi.fn(),
      getComments: vi.fn(), addComment: vi.fn(), markWatched: vi.fn(), create: vi.fn(), upload: vi.fn(),
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

const nonAdminUser = {
  user: { id: 'u1', email: 'user@test.com', username: 'user', role: 'user', created_at: '', updated_at: '' },
}

const adminUser = {
  user: { id: 'admin1', email: 'admin@test.com', username: 'admin', role: 'admin', created_at: '', updated_at: '' },
}

function renderLayout() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Layout />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('token', 'test-token')
    mockMe.mockResolvedValue(nonAdminUser)
  })

  it('renders navigation with brand name', async () => {
    renderLayout()
    expect(await screen.findByText('VidFriends')).toBeInTheDocument()
  })

  it('renders basic navigation links for non-admin', async () => {
    renderLayout()
    expect(await screen.findByRole('link', { name: /send/i })).toHaveAttribute('href', '/send')
    expect(screen.getByRole('link', { name: /inbox/i })).toHaveAttribute('href', '/inbox')
    expect(screen.getByRole('link', { name: /history/i })).toHaveAttribute('href', '/history')
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/profile')
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument()
  })

  it('renders admin link for admin user', async () => {
    mockMe.mockResolvedValue(adminUser)
    renderLayout()
    expect(await screen.findByRole('link', { name: /admin/i })).toHaveAttribute('href', '/admin')
  })

  it('renders logout button', async () => {
    renderLayout()
    expect(await screen.findByRole('button', { name: /logout/i })).toBeInTheDocument()
  })

  it('has a mobile menu toggle', async () => {
    renderLayout()
    expect(await screen.findByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })
})
