import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('VideoPlayer', () => {
  beforeEach(() => {
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    HTMLVideoElement.prototype.pause = vi.fn()
    HTMLVideoElement.prototype.addEventListener = vi.fn()
    HTMLVideoElement.prototype.removeEventListener = vi.fn()
    HTMLVideoElement.prototype.load = vi.fn()
  })

  it('renders video element with src and poster', async () => {
    const { VideoPlayer } = await import('../../components/VideoPlayer')
    render(
      <VideoPlayer
        src="https://example.com/video.mp4"
        poster="https://example.com/thumb.jpg"
      />,
    )

    const video = screen.getByLabelText('Video player')
    expect(video).toHaveAttribute('src', 'https://example.com/video.mp4')
    expect(video).toHaveAttribute('poster', 'https://example.com/thumb.jpg')
  })

  it('renders play/pause button in controls', async () => {
    const { VideoPlayer } = await import('../../components/VideoPlayer')
    render(<VideoPlayer src="https://example.com/video.mp4" />)
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()
  })

  it('renders time display', async () => {
    const { VideoPlayer } = await import('../../components/VideoPlayer')
    render(<VideoPlayer src="https://example.com/video.mp4" />)
    expect(screen.getByText(/0:00 \/ 0:00/)).toBeInTheDocument()
  })

  it('renders seek slider', async () => {
    const { VideoPlayer } = await import('../../components/VideoPlayer')
    render(<VideoPlayer src="https://example.com/video.mp4" />)
    expect(screen.getByRole('slider', { name: /seek/i })).toBeInTheDocument()
  })

  it('renders with autoPlay', async () => {
    const { VideoPlayer } = await import('../../components/VideoPlayer')
    render(<VideoPlayer src="https://example.com/video.mp4" autoPlay />)
    const video = screen.getByLabelText('Video player')
    expect(video).toHaveAttribute('autoplay')
  })

  it('does not crash with callbacks', async () => {
    const { VideoPlayer } = await import('../../components/VideoPlayer')
    render(<VideoPlayer src="https://example.com/video.mp4" onProgress={vi.fn()} onEnded={vi.fn()} />)
    expect(screen.getByLabelText('Video player')).toBeInTheDocument()
  })
})
