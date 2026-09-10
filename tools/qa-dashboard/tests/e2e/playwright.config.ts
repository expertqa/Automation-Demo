import path from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * Dashboard UI tests. A dedicated, seeded data directory is created by
 * global-setup so these never touch real dashboard-data.
 */
export const E2E_PORT = 3999;
export const E2E_DATA_DIR = path.join(__dirname, '.data');

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.ts/,
  outputDir: path.join(__dirname, '.test-results'),
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: 'npx tsx tests/e2e/serve.ts',
    cwd: path.join(__dirname, '..', '..'),
    url: `http://127.0.0.1:${E2E_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: String(E2E_PORT) },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
