import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production images via compose (TDD §7, NFR-MAINT-03).
// Start the stack with `pnpm --filter @vidfriends/e2e stack:up` (CI does this before the tests).
const baseURL = process.env.E2E_BASE_URL ?? 'https://localhost:8443';
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
// Branded Chrome plays H.264/AAC like users' browsers; open-source Chromium builds cannot (CI sets this).
const chromeChannel = process.env.E2E_CHROME_CHANNEL === '1' ? { channel: 'chrome' as const } : {};
const allBrowsers = process.env.E2E_ALL_BROWSERS === '1';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    ignoreHTTPSErrors: true, // Caddy's local CA for `localhost`
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /setup\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
    {
      name: 'chromium',
      testIgnore: /setup\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], ...chromeChannel, launchOptions: { executablePath } },
    },
    ...(allBrowsers
      ? [
          {
            name: 'firefox',
            testIgnore: /setup\.spec\.ts/,
            dependencies: ['setup'],
            use: { ...devices['Desktop Firefox'] },
          },
          {
            name: 'webkit',
            testIgnore: /setup\.spec\.ts/,
            dependencies: ['setup'],
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),
  ],
});
