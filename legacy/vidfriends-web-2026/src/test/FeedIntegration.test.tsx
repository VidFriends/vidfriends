import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import type { Video } from '../lib/types'

const mockVideos: Video[] = [
  {
    id: 'v1',
    user_id: 'u1',
    title: 'Integration test video',
    description: 'Testing full pipeline',
    file_url: 'https://example.com/vid.mp4',
    user_name: 'testuser',
    like_count: 15,
    comment_count: 5,
    liked: false,
    status: 'ready',
    created_at: '2024-06-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
  },
]

const {
  mockGetFypFeed, mockLike, mockUnlike, mockMe,
} = vi.hoisted(() => ({
  mockGetFypFeed: vi.fn(),
  mockLike: vi.fn(),
  mockUnlike: vi.fn(),
  mockMe: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: {
    auth: {
      register: vi.fn(),
      login: vi.fn().mockResolvedValue({ token: 'fake-token' }),
      refresh: vi.fn(),
      me: mockMe,
      updateProfile: vi.fn(),
    },
    videos: {
      getFypFeed: mockGetFypFeed,
      getFeed: vi.fn().mockResolvedValue([]),
      like: mockLike,
      unlike: mockUnlike,
      markWatched: vi.fn(),
      getComments: vi.fn(),
      addComment: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn(),
      upload: vi.fn(),
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

function renderApp(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Feed integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()
    })
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    HTMLVideoElement.prototype.pause = vi.fn()
    HTMLVideoElement.prototype.addEventListener = vi.fn()
    HTMLVideoElement.prototype.removeEventListener = vi.fn()
    HTMLVideoElement.prototype.load = vi.fn()
    localStorage.clear()
    localStorage.setItem('token', 'pre-auth-token')
    mockMe.mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com', username: 'testuser', created_at: '', updated_at: '' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and displays feed with videos when authenticated', async () => {
    mockGetFypFeed.mockResolvedValueOnce(mockVideos)

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Integration test video')).toBeInTheDocument()
    })

    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('testuser')).toBeInTheDocument()
  })

  it('likes a video from the feed', async () => {
    mockGetFypFeed.mockResolvedValueOnce(mockVideos)
    mockLike.mockResolvedValueOnce({ status: 'ok' })

    renderApp()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Integration test video')).toBeInTheDocument()
    })

    const likeBtn = screen.getByLabelText('Like')
    await user.click(likeBtn)

    expect(mockLike).toHaveBeenCalledWith('v1')
  })
})
