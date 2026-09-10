import path from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * Self-contained Playwright project used to exercise the dashboard pipeline with
 * REAL artifacts (screenshots, video, trace). It never touches the network.
 *
 *   npm run fixtures:run            (inside tools/qa-dashboard)
 */
export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  outputDir: path.join(__dirname, '.test-results'),
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 15_000,
  reporter: [
    ['list'],
    [
      path.join(__dirname, '..', 'reporter', 'index.ts'),
      {
        mode: process.env.QA_DASHBOARD_MODE ?? 'local',
        dataDir: process.env.QA_DASHBOARD_DATA_DIR ?? path.join(__dirname, '.dashboard-data'),
        packageDir: process.env.QA_DASHBOARD_PACKAGE_DIR ?? path.join(__dirname, '.package'),
        environment: process.env.QA_DASHBOARD_ENV ?? 'fixture',
      },
    ],
  ],
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
