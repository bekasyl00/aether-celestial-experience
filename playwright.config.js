import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (!process.env.CI && existsSync(localChrome) ? localChrome : undefined);
const baseURL = process.env.PLAYWRIGHT_BASE_URL
  || 'http://127.0.0.1:4173/aether-celestial-experience/';

export default defineConfig({
  testDir: './tests',
  outputDir: './work/test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: 'list',
  use: {
    baseURL,
    launchOptions: { executablePath },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
