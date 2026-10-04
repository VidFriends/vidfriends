import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFriends = [
  { id: '1', user_id: 'u1', username: 'alice', status: 'accepted', created_at: '2024-01-01T00:00:00Z' },
  { id: '2', user_id: 'u2', username: 'bob', status: 'accepted', created_at: '2024-01-02T00:00:00Z' },
  { id: '3', user_id: 'u3', username: 'charlie', status: 'accepted', created_at: '2024-01-03T00:00:00Z' },
]

vi.mock('../../lib/api', () => ({
  api: {
    friends: {
      list: vi.fn().mockResolvedValue(mockFriends),
    },
  },
}))

describe('FriendPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', async () => {
    const { FriendPicker } = await import('../../components/FriendPicker')
    render(<FriendPicker selectedUserId={null} onSelect={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders friends after loading', async () => {
    const { FriendPicker } = await import('../../components/FriendPicker')
    render(<FriendPicker selectedUserId={null} onSelect={() => {}} />)

    expect(await screen.findByText(/type to search/i)).toBeInTheDocument()
  })

  it('filters friends by search input', async () => {
    const { FriendPicker } = await import('../../components/FriendPicker')
    const user = userEvent.setup()
    render(<FriendPicker selectedUserId={null} onSelect={() => {}} />)

    const input = await screen.findByLabelText(/search friends/i)
    await user.type(input, 'ali')

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.queryByText('bob')).not.toBeInTheDocument()
  })

  it('calls onSelect with friend when selected', async () => {
    const onSelect = vi.fn()
    const { FriendPicker } = await import('../../components/FriendPicker')
    const user = userEvent.setup()
    render(<FriendPicker selectedUserId={null} onSelect={onSelect} />)

    const input = await screen.findByLabelText(/search friends/i)
    await user.type(input, 'bob')

    const bobBtn = await screen.findByText('bob')
    await user.click(bobBtn)

    expect(onSelect).toHaveBeenCalledWith(mockFriends[1])
  })

  it('shows selected friend and change button', async () => {
    const { FriendPicker } = await import('../../components/FriendPicker')
    render(<FriendPicker selectedUserId="u1" onSelect={() => {}} />)

    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove recipient/i })).toHaveTextContent('Change')
  })

  it('calls onSelect with null when change is clicked', async () => {
    const onSelect = vi.fn()
    const { FriendPicker } = await import('../../components/FriendPicker')
    const user = userEvent.setup()
    render(<FriendPicker selectedUserId="u2" onSelect={onSelect} />)

    const changeBtn = await screen.findByRole('button', { name: /remove recipient/i })
    await user.click(changeBtn)

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('shows no friends message when list is empty', async () => {
    const { api } = await import('../../lib/api')
    vi.mocked(api.friends.list).mockResolvedValueOnce([])
    const { FriendPicker } = await import('../../components/FriendPicker')
    const user = userEvent.setup()
    render(<FriendPicker selectedUserId={null} onSelect={() => {}} />)

    const input = await screen.findByLabelText(/search friends/i)
    await user.type(input, 'anything')

    expect(await screen.findByText(/no friends yet/i)).toBeInTheDocument()
  })

  it('shows no search results message', async () => {
    const { FriendPicker } = await import('../../components/FriendPicker')
    const user = userEvent.setup()
    render(<FriendPicker selectedUserId={null} onSelect={() => {}} />)

    const input = await screen.findByLabelText(/search friends/i)
    await user.type(input, 'nonexistent')

    expect(await screen.findByText(/no friends match/i)).toBeInTheDocument()
  })
})
