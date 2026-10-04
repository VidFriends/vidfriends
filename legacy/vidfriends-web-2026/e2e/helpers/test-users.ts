const COUNTER = { value: Date.now() }

export function uniqueUser() {
  const n = COUNTER.value++
  return {
    email: `e2e-user-${n}@vidfriends-test.example`,
    username: `e2euser${n}`,
    password: 'TestPass123!',
    displayName: `Test User ${n}`,
  }
}

export function uniqueAdminUser() {
  const n = COUNTER.value++
  return {
    email: `e2e-admin-${n}@vidfriends-test.example`,
    username: `e2eadmin${n}`,
    password: 'AdminPass123!',
    displayName: `Admin User ${n}`,
  }
}
