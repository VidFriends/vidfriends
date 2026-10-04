import { test as base } from '@playwright/test'
import { api } from '../helpers/api'
import { uniqueUser } from '../helpers/test-users'

type AuthFixture = {
  user: ReturnType<typeof uniqueUser>
  token: string
  userId: string
}

export const test = base.extend<AuthFixture>({
  user: async ({}, use) => {
    await use(uniqueUser())
  },
  token: async ({ user }, use) => {
    const { data } = await api.auth.register(user.email, user.username, user.password, user.displayName)
    use(data.token)
  },
  userId: async ({ token }, use) => {
    const { data } = await api.auth.me(token)
    use(data.user.id)
  },
})

export { expect } from '@playwright/test'
