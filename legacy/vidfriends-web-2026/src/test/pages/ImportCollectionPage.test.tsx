import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockImportResponse = {
  collection_id: 'col-123',
  collection_name: 'My Import',
  results: [
    { url: 'https://youtube.com/watch?v=abc', status: 'imported' as const, title: 'Funny cats' },
    { url: 'https://vimeo.com/123', status: 'skipped' as const, title: 'Already exists' },
    { url: 'https://example.com/bad', status: 'failed' as const, error: 'Unsupported URL' },
  ],
}

const mockCollectionDetail = {
  id: 'col-123',
  name: 'My Import',
  status: 'ready',
  video_count: 1,
}

vi.mock('../../lib/api', () => ({
  api: {
    collections: {
      importUrls: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      getVideos: vi.fn(),
      addVideo: vi.fn(),
      removeVideo: vi.fn(),
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

describe('ImportCollectionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title and tabs', async () => {
    const { ImportCollectionPage } = await import('../../pages/ImportCollectionPage')
    render(<MemoryRouter><ImportCollectionPage /></MemoryRouter>)

    expect(screen.getByText('Import Collections')).toBeInTheDocument()
    expect(screen.getByText('Paste URLs')).toBeInTheDocument()
    expect(screen.getByText('From YouTube')).toBeInTheDocument()
  })

  it('shows URL textarea and submit button on Paste URLs tab', async () => {
    const { ImportCollectionPage } = await import('../../pages/ImportCollectionPage')
    render(<MemoryRouter><ImportCollectionPage /></MemoryRouter>)

    expect(screen.getByLabelText(/paste urls/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import urls/i })).toBeInTheDocument()
  })

  it('submits URLs and shows results table', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.importUrls).mockResolvedValueOnce(mockImportResponse)
    const user = userEvent.setup()

    const { ImportCollectionPage } = await import('../../pages/ImportCollectionPage')
    render(<MemoryRouter><ImportCollectionPage /></MemoryRouter>)

    const textarea = screen.getByLabelText(/paste urls/i)
    await user.type(textarea, 'https://youtube.com/watch?v=abc\nhttps://vimeo.com/123\nhttps://example.com/bad')

    await user.click(screen.getByRole('button', { name: /import urls/i }))

    expect(await screen.findByText('Imported')).toBeInTheDocument()
    expect(screen.getByText('Skipped')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Funny cats')).toBeInTheDocument()
    expect(screen.getByText('Already exists')).toBeInTheDocument()
    expect(screen.getByText('Unsupported URL')).toBeInTheDocument()
  })

  it('shows error state when import fails', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.importUrls).mockRejectedValueOnce(new Error('Network error'))
    const user = userEvent.setup()

    const { ImportCollectionPage } = await import('../../pages/ImportCollectionPage')
    render(<MemoryRouter><ImportCollectionPage /></MemoryRouter>)

    const textarea = screen.getByLabelText(/paste urls/i)
    await user.type(textarea, 'https://youtube.com/watch?v=abc')
    await user.click(screen.getByRole('button', { name: /import urls/i }))

    expect(await screen.findByText('Network error')).toBeInTheDocument()
  })

  it('shows polling state when no immediate results', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.importUrls).mockResolvedValueOnce({
      collection_id: 'col-456',
      results: [],
    })
    vi.mocked(api.collections.get).mockResolvedValue(mockCollectionDetail)
    const user = userEvent.setup()

    const { ImportCollectionPage } = await import('../../pages/ImportCollectionPage')
    render(<MemoryRouter><ImportCollectionPage /></MemoryRouter>)

    const textarea = screen.getByLabelText(/paste urls/i)
    await user.type(textarea, 'https://youtube.com/watch?v=abc')
    await user.click(screen.getByRole('button', { name: /import urls/i }))

    expect(await screen.findByText('Processing import...')).toBeInTheDocument()
  })

  it('shows YouTube tab with placeholder', async () => {
    const { ImportCollectionPage } = await import('../../pages/ImportCollectionPage')
    render(<MemoryRouter><ImportCollectionPage /></MemoryRouter>)

    await userEvent.setup().click(screen.getByText('From YouTube'))

    expect(screen.getByText('Import from YouTube')).toBeInTheDocument()
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect youtube/i })).toBeDisabled()
  })

  it('shows View Collection button after successful import', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.collections.importUrls).mockResolvedValueOnce(mockImportResponse)
    const user = userEvent.setup()

    const { ImportCollectionPage } = await import('../../pages/ImportCollectionPage')
    render(<MemoryRouter><ImportCollectionPage /></MemoryRouter>)

    const textarea = screen.getByLabelText(/paste urls/i)
    await user.type(textarea, 'https://youtube.com/watch?v=abc')
    await user.click(screen.getByRole('button', { name: /import urls/i }))

    expect(await screen.findByText('View Collection')).toBeInTheDocument()
    expect(screen.getByText('Import More')).toBeInTheDocument()
  })
})
