import { test, expect } from '../fixtures/auth-fixture'
import { api } from '../helpers/api'

test.describe('Video Interaction Flow', () => {
  test('watch a video on the feed, like it, and add a comment', async ({ page, token }) => {
    const { data: video } = await api.videos.createFromLink(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'E2E Feed Test Video',
      token,
    )

    await api.videos.markWatched(video.id, token)

    await page.goto('/')
    await page.evaluate((t) => localStorage.setItem('token', t), token)
    await page.goto('/')

    await page.waitForTimeout(2000)
    await page.goto(`/videos/${video.id}`)

    await expect(page.getByText('E2E Feed Test Video')).toBeVisible({ timeout: 10000 })

    const likeButton = page.getByRole('button', { name: /like this video/i })
    await likeButton.click()
    await expect(page.getByRole('button', { name: /unlike this video/i })).toBeVisible()

    await api.videos.unlike(video.id, token)
  })

  test('add and view comments on a video', async ({ page, token }) => {
    const { data: video } = await api.videos.createFromLink(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'E2E Comment Test',
      token,
    )

    await page.goto(`/videos/${video.id}`)
    await page.evaluate((t) => localStorage.setItem('token', t), token)
    await page.goto(`/videos/${video.id}`)

    const commentText = `E2E test comment ${Date.now()}`
    await page.getByPlaceholder(/add a comment/i).fill(commentText)
    await page.getByRole('button', { name: /^post$/i }).click()
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 })

    const replyText = `E2E reply ${Date.now()}`
    await page.getByRole('button', { name: /reply to comment/i }).first().click()
    await page.getByPlaceholder(/write a reply/i).fill(replyText)
    await page.getByRole('button', { name: /^reply$/i }).click()
    await expect(page.getByText(replyText)).toBeVisible({ timeout: 10000 })
  })
})
