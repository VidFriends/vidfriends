import { test, expect } from '../fixtures/auth-fixture'
import { api } from '../helpers/api'
import { uniqueUser } from '../helpers/test-users'

test.describe('Auth Flow', () => {
  test('register new user, login, and logout end-to-end', async ({ page }) => {
    const user = uniqueUser()

    await page.goto('/register')
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible()

    await page.getByLabel(/email/i).fill(user.email)
    await page.getByLabel(/username/i).fill(user.username)
    await page.getByLabel(/^password/i).fill(user.password)
    await page.getByRole('button', { name: /create account/i }).click()

    await page.waitForURL('/send')

    await page.goto('/profile')
    await expect(page.getByText(user.email)).toBeVisible()

    await page.getByRole('button', { name: /logout/i }).click()
    await page.waitForURL('/login')

    await page.goto('/send')
    await page.waitForURL('/login')
  })

  test('login with existing credentials', async ({ page }) => {
    const user = uniqueUser()
    await api.auth.register(user.email, user.username, user.password)

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()

    await page.getByLabel(/email/i).fill(user.email)
    await page.getByLabel(/password/i).fill(user.password)
    await page.getByRole('button', { name: /sign in/i }).click()

    await page.waitForURL('/send')

    await page.goto('/profile')
    await expect(page.getByText(user.email)).toBeVisible()
  })

  test('show error on invalid login', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel(/email/i).fill('nonexistent@test.example')
    await page.getByLabel(/password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page.getByText(/invalid|error|failed/i)).toBeVisible()
  })

  test('redirect authenticated user to send page', async ({ page, token }) => {
    await page.goto('/login')
    await page.evaluate((t) => localStorage.setItem('token', t), token)
    await page.goto('/login')
    await page.waitForURL('/send')
  })

  test('redirect unauthenticated user to login', async ({ page }) => {
    await page.goto('/history')
    await page.waitForURL('/login')
  })
})
