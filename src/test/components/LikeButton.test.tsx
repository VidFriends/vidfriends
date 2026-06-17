import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { LikeButton } from '../../components/LikeButton'

describe('LikeButton', () => {
  it('renders count and liked state', () => {
    render(<LikeButton liked={false} count={42} onToggle={() => {}} />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /like this video/i })).toBeInTheDocument()
  })

  it('renders liked state with different label', () => {
    render(<LikeButton liked={true} count={5} onToggle={() => {}} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unlike this video/i })).toBeInTheDocument()
  })

  it('calls onToggle when clicked', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<LikeButton liked={false} count={0} onToggle={onToggle} />)
    await user.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('is disabled when loading', () => {
    render(<LikeButton liked={false} count={0} onToggle={() => {}} loading={true} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
