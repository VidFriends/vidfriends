import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockVideo = {
  id: 'v1',
  user_id: 'u1',
  title: 'My awesome video',
  description: 'Check this out!',
  file_url: 'https://example.com/video.mp4',
  thumbnail_url: undefined,
  user_name: 'alice',
  like_count: 10,
  comment_count: 3,
  liked: false,
  status: 'ready' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockObserve = vi.fn()
const mockDisconnect = vi.fn()

class MockIntersectionObserver {
  observe = mockObserve
  disconnect = mockDisconnect
  unobserve = vi.fn()
  constructor() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

const mockLike = vi.fn().mockResolvedValue({ status: 'ok' })
const mockUnlike = vi.fn().mockResolvedValue({ status: 'ok' })

vi.mock('../../lib/api', () => ({
  api: {
    videos: {
      like: mockLike,
      unlike: mockUnlike,
      markWatched: vi.fn().mockResolvedValue({ status: 'ok' }),
      getComments: vi.fn(),
      addComment: vi.fn(),
      getFeed: vi.fn(),
      getFypFeed: vi.fn(),
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

describe('VideoCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    HTMLVideoElement.prototype.pause = vi.fn()
    HTMLVideoElement.prototype.addEventListener = vi.fn()
    HTMLVideoElement.prototype.removeEventListener = vi.fn()
    HTMLVideoElement.prototype.load = vi.fn()
  })

  it('renders user name and title', async () => {
    const { VideoCard } = await import('../../components/VideoCard')
    render(
      <MemoryRouter>
        <VideoCard video={mockVideo} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByText('My awesome video')).toBeInTheDocument()
  })

  it('renders description when present', async () => {
    const { VideoCard } = await import('../../components/VideoCard')
    render(
      <MemoryRouter>
        <VideoCard video={mockVideo} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Check this out!')).toBeInTheDocument()
  })

  it('renders user avatar initial', async () => {
    const { VideoCard } = await import('../../components/VideoCard')
    render(
      <MemoryRouter>
        <VideoCard video={mockVideo} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('A')).toBeInTheDocument()
  })

  it('renders like and comment counts', async () => {
    const { VideoCard } = await import('../../components/VideoCard')
    render(
      <MemoryRouter>
        <VideoCard video={mockVideo} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('10')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders video element with file_url', async () => {
    const { VideoCard } = await import('../../components/VideoCard')
    const { container } = render(
      <MemoryRouter>
        <VideoCard video={mockVideo} />
      </MemoryRouter>,
    )
    await screen.findByText('alice')
    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('src', 'https://example.com/video.mp4')
  })

  it('shows placeholder when no file_url or thumbnail', async () => {
    const { VideoCard } = await import('../../components/VideoCard')
    const noVideo = { ...mockVideo, file_url: undefined, thumbnail_url: undefined }
    render(
      <MemoryRouter>
        <VideoCard video={noVideo} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('A')).toBeInTheDocument()
  })

  it('likes video when like button is clicked', async () => {
    const { VideoCard } = await import('../../components/VideoCard')
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <VideoCard video={{ ...mockVideo, liked: false, like_count: 5 }} />
      </MemoryRouter>,
    )

    const likeBtn = await screen.findByLabelText('Like')
    await user.click(likeBtn)

    expect(mockLike).toHaveBeenCalledWith('v1')
  })

  it('unlikes video when unlike button is clicked', async () => {
    const { VideoCard } = await import('../../components/VideoCard')
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <VideoCard video={{ ...mockVideo, liked: true, like_count: 5 }} />
      </MemoryRouter>,
    )

    const unlikeBtn = await screen.findByLabelText('Unlike')
    await user.click(unlikeBtn)

    expect(mockUnlike).toHaveBeenCalledWith('v1')
  })

  it('sets up intersection observer', async () => {
    const { VideoCard } = await import('../../components/VideoCard')
    render(
      <MemoryRouter>
        <VideoCard video={mockVideo} />
      </MemoryRouter>,
    )
    await screen.findByText('alice')
    expect(mockObserve).toHaveBeenCalled()
  })
})
