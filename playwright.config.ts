import { defineConfig } from '@playwright/test';

/**
 * Browser smoke tests: the built extension (.output/chrome-mv3) in a real Chromium,
 * against local fixture pages only (no network). Run `npm run build` first.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
});
