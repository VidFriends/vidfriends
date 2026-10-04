# E2E Test Suite

End-to-end tests for VidFriends Web using [Playwright](https://playwright.dev/).

## Prerequisites

- Go backend (vidflow) running on port 8080 (`VIDFRIENDS_ALLOW_PUBLIC_SIGNUP=true`)
- Web dev server running on port 5173 (`npm run dev`)
- Node.js 22+

## Quick Start

```bash
# 1. Start the backend stack (PostgreSQL + MinIO + Go API)
docker compose -f e2e/docker-compose.e2e.yml up --build --wait -d

# 2. Start the web dev server
npm run dev

# 3. Run E2E tests
npm run test:e2e

# 4. Clean up backend
docker compose -f e2e/docker-compose.e2e.yml down -v
```

## Test Structure

```
e2e/
  playwright.config.ts    Playwright configuration
  docker-compose.e2e.yml  Backend services for E2E
  .env.e2e.example        Environment variables template
  helpers/
    api.ts                API client for test setup/teardown
    test-users.ts         Unique test user generators
  fixtures/
    auth-fixture.ts       Playwright fixtures with auth
  specs/
    auth.spec.ts          Register, login, logout
    send.spec.ts          Video link import + share to friend
    video.spec.ts         Watch, like, comment
    history.spec.ts       Watch history verification
    admin.spec.ts         Admin panel: stats, users, activity
```

## Critical Path Coverage

```
auth → send (link) → watch → like → comment → history → admin toggle
```

## CI

E2E tests run in CI via GitHub Actions. The workflow:

1. Starts PostgreSQL, MinIO, and migrates the database
2. Builds and starts the Go backend
3. Builds the web frontend and starts a preview server
4. Runs Playwright tests against the preview server
5. Uploads the Playwright HTML report on failure
6. Tears down all services

## Writing Tests

- Use `uniqueUser()` for test credentials to avoid collisions
- Prefer API calls for setup (register user, create videos)
- Use Playwright page interactions for the actual test flow
- Use `page.evaluate` to set localStorage tokens for auth setup
- Keep tests independent — each test creates its own data
