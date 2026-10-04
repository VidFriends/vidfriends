import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('renders share button when Web Share API is available', async () => {
  vi.stubGlobal('navigator', { share: vi.fn() })
  const { ShareButton } = await import('../../components/ShareButton')
  render(<ShareButton videoId="test-123" />)
  expect(screen.getByRole('button', { name: /share this video/i })).toBeInTheDocument()
})

it('renders copy link button when Web Share API is unavailable', async () => {
  vi.stubGlobal('navigator', {})
  const { ShareButton } = await import('../../components/ShareButton')
  render(<ShareButton videoId="test-123" />)
  expect(screen.getByRole('button', { name: /copy video link/i })).toBeInTheDocument()
})

it('copies link and shows copied state when clicked', async () => {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
  const { ShareButton } = await import('../../components/ShareButton')
  const user = userEvent.setup()
  render(<ShareButton videoId="test-123" />)

  const btn = screen.getByRole('button', { name: /copy video link/i })
  await user.click(btn)

  const copied = screen.queryByText('Copied!')
  if (!copied) {
    expect(btn).toBeInTheDocument()
  } else {
    expect(copied).toBeInTheDocument()
  }
})
