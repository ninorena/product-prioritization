import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// `npm test` writes this file from the test project before the run.
if (existsSync('.env.test.local')) process.loadEnvFile('.env.test.local');
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalTeardown: './tests/teardown.ts',
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 1000 },
  },
  webServer: {
    command: 'npx vite --mode test',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
