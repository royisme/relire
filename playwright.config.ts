/**
 * End-to-end checks: the real app in Chromium with every AI call answered from
 * fixtures (e2e/fixtures.ts). No key, no network, no paid request.
 * Uses the installed Chrome, or CHROME_PATH; never downloads a browser.
 */
import { defineConfig, devices } from '@playwright/test';

const port = 5174;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.CHROME_PATH
      ? { launchOptions: { executablePath: process.env.CHROME_PATH } }
      : { channel: 'chrome' }),
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
      grepInvert: /@phone/,
    },
    { name: 'phone', use: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true }, grep: /@phone/ },
  ],
  webServer: {
    env: { VITE_CONTENT_SERVICE_URL: 'http://content.test' },
    command: `bun run dev --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
