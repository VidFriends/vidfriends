import { test, expect } from '../fixtures/auth-fixture'
import { api } from '../helpers/api'
import { uniqueUser } from '../helpers/test-users'

test.describe('Send Flow', () => {
  test('paste a video link and share with a friend', async ({ page, token }) => {
    const friend = uniqueUser()
    const { data: friendReg } = await api.auth.register(friend.email, friend.username, friend.password)
    const { data: friendMe } = await api.auth.me(friendReg.token)

    await page.goto('/send')
    await page.evaluate((t) => localStorage.setItem('token', t), token)
    await page.goto('/send')

    const linkInput = page.getByPlaceholder(/youtube/i)
    await expect(linkInput).toBeVisible()
    await linkInput.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')

    const titleInput = page.getByPlaceholder(/my video/i)
    await titleInput.fill('E2E Test Video')

    await page.getByRole('button', { name: /submit link/i }).click()
    await expect(page.getByText(/share with a friend/i)).toBeVisible({ timeout: 10000 })

    const searchInput = page.getByPlaceholder(/search friends/i)
    await searchInput.fill(friend.username)

    await page.getByText(friend.username).first().click()
    await page.waitForTimeout(500)

    const captionInput = page.getByPlaceholder(/say something/i)
    await captionInput.fill('Check out this video!')

    await page.getByRole('button', { name: new RegExp(`send to ${friend.username}`, 'i') }).click()
    await expect(page.getByText(new RegExp(`sent to ${friend.username}`, 'i'))).toBeVisible({ timeout: 10000 })
  })

  test('upload mode shows file picker and reset works', async ({ page, token }) => {
    await page.goto('/send')
    await page.evaluate((t) => localStorage.setItem('token', t), token)
    await page.goto('/send')

    await page.getByRole('button', { name: /upload file/i }).click()
    await expect(page.getByText(/drag and drop/i)).toBeVisible()

    await page.getByRole('button', { name: /paste link/i }).click()
    await expect(page.getByPlaceholder(/youtube/i)).toBeVisible()
  })
})
