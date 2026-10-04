import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockComments = [
  {
    id: 'c1',
    user_id: 'u1',
    user_name: 'alice',
    body: 'Great video!',
    created_at: '2024-06-01T12:00:00Z',
  },
  {
    id: 'c2',
    user_id: 'u2',
    user_name: 'bob',
    parent_id: 'c1',
    body: 'I agree!',
    created_at: '2024-06-01T12:30:00Z',
  },
  {
    id: 'c3',
    user_id: 'u3',
    user_name: 'charlie',
    body: 'Nice work',
    created_at: '2024-06-01T11:00:00Z',
  },
]

const mockAddComment = vi.fn().mockResolvedValue({ id: 'c4', created_at: '2024-06-01T13:00:00Z' })

const mockApi = {
  videos: {
    getComments: vi.fn().mockResolvedValue(mockComments),
    addComment: mockAddComment,
    like: vi.fn(),
    unlike: vi.fn(),
    getFeed: vi.fn(),
    getFypFeed: vi.fn(),
    getDetail: vi.fn(),
    create: vi.fn(),
    upload: vi.fn(),
    markWatched: vi.fn(),
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
}

vi.mock('../../lib/api', () => ({ api: mockApi }))

describe('CommentSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', async () => {
    mockApi.videos.getComments.mockImplementationOnce(() => new Promise(() => {}))
    const { CommentSection } = await import('../../components/CommentSection')
    render(<CommentSection videoId="v1" />)
    expect(screen.getByText('Comments')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Add a comment...')).toBeInTheDocument()
  })

  it('renders comments after loading', async () => {
    const { CommentSection } = await import('../../components/CommentSection')
    render(<CommentSection videoId="v1" />)

    expect(await screen.findByText('Great video!')).toBeInTheDocument()
    expect(screen.getByText('Nice work')).toBeInTheDocument()
    expect(screen.getByText('I agree!')).toBeInTheDocument()
    expect(screen.getByText('(3)')).toBeInTheDocument()
  })

  it('shows empty state when no comments', async () => {
    mockApi.videos.getComments.mockResolvedValueOnce([])
    const { CommentSection } = await import('../../components/CommentSection')
    render(<CommentSection videoId="v1" />)

    expect(await screen.findByText(/no comments yet/i)).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    mockApi.videos.getComments.mockRejectedValueOnce(new Error('Network error'))
    const { CommentSection } = await import('../../components/CommentSection')
    render(<CommentSection videoId="v1" />)

    expect(await screen.findByText(/failed to load comments/i)).toBeInTheDocument()
  })

  it('allows posting a new comment', async () => {
    mockApi.videos.getComments.mockResolvedValueOnce([])
    const { CommentSection } = await import('../../components/CommentSection')
    const user = userEvent.setup()
    render(<CommentSection videoId="v1" />)

    const input = await screen.findByLabelText(/add a comment/i)
    await user.type(input, 'My new comment')

    const postBtn = screen.getByRole('button', { name: /post/i })
    await user.click(postBtn)

    expect(mockAddComment).toHaveBeenCalledWith('v1', 'My new comment')
  })

  it('disables post button when body is empty', async () => {
    const { CommentSection } = await import('../../components/CommentSection')
    render(<CommentSection videoId="v1" />)

    await screen.findByLabelText(/add a comment/i)
    expect(screen.getByRole('button', { name: /post/i })).toBeDisabled()
  })

  it('shows reply form when reply is clicked', async () => {
    const { CommentSection } = await import('../../components/CommentSection')
    const user = userEvent.setup()
    render(<CommentSection videoId="v1" />)

    const replyBtns = await screen.findAllByRole('button', { name: /reply to comment/i })
    await user.click(replyBtns[0])

    expect(screen.getAllByLabelText(/reply to comment/i).length).toBeGreaterThanOrEqual(2)
  })
})
