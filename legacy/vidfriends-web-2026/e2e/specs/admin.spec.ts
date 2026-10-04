import { test, expect } from '@playwright/test'
import { api } from '../helpers/api'
import { uniqueUser } from '../helpers/test-users'

let adminToken: string
let regularToken: string

test.beforeAll(async () => {
  const admin = uniqueUser()
  const { data: areg } = await api.auth.register(admin.email, admin.username, admin.password)
  const { data: ame } = await api.auth.me(areg.token)
  await api.admin.updateUser(ame.user.id, { role: 'admin' }, areg.token)
  adminToken = areg.token

  const regular = uniqueUser()
  const { data: rreg } = await api.auth.register(regular.email, regular.username, regular.password)
  regularToken = rreg.token
})

test.describe('Admin Flow', () => {
  test('admin can view stats and users', async ({ page }) => {
    await page.goto('/admin')
    await page.evaluate((t) => localStorage.setItem('token', t), adminToken)
    await page.goto('/admin')

    await expect(page.getByText(/total videos/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/total users/i)).toBeVisible()
  })

  test('admin can view users tab', async ({ page }) => {
    await page.goto('/admin')
    await page.evaluate((t) => localStorage.setItem('token', t), adminToken)
    await page.goto('/admin')

    await page.getByRole('button', { name: /^users$/i }).click()
    await page.waitForTimeout(1000)

    await expect(page.getByText(/username/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('non-admin user cannot access admin page', async ({ page }) => {
    await page.goto('/admin')
    await page.evaluate((t) => localStorage.setItem('token', t), regularToken)
    await page.goto('/admin')

    await expect(page).not.toHaveURL('/admin')
  })

  test('admin can view activity log tab', async ({ page }) => {
    await page.goto('/admin')
    await page.evaluate((t) => localStorage.setItem('token', t), adminToken)
    await page.goto('/admin')

    await page.getByRole('button', { name: /activity log/i }).click()
    await page.waitForTimeout(1000)
  })
})
