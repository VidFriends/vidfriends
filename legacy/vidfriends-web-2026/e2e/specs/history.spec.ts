import { test, expect } from '../fixtures/auth-fixture'
import { api } from '../helpers/api'

test.describe('History Flow', () => {
  test('watched video appears in history', async ({ page, token }) => {
    const { data: video } = await api.videos.createFromLink(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'E2E History Test Video',
      token,
    )

    await api.videos.markWatched(video.id, token, 30)

    const { data: history } = await api.history.get(token)
    expect(history.some((h) => h.video_id === video.id)).toBeTruthy()

    await page.goto('/history')
    await page.evaluate((t) => localStorage.setItem('token', t), token)
    await page.goto('/history')

    await expect(page.getByText('E2E History Test Video')).toBeVisible({ timeout: 10000 })
  })

  test('history page is empty for new user', async ({ page, token }) => {
    await page.goto('/history')
    await page.evaluate((t) => localStorage.setItem('token', t), token)
    await page.goto('/history')

    await expect(page.getByText(/no history yet/i)).toBeVisible({ timeout: 5000 })
  })
})
