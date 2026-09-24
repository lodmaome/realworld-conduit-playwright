import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL ?? 'http://localhost:4200';
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:8080/api';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  // Day-1 stopgap for ordinary CI environment noise (container cold starts, etc.).
  // This is intentionally blind — see tools/flake-report for the retry-with-reporting
  // and quarantine mechanism meant to replace reliance on this once it exists.
  retries: isCI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['allure-playwright', { resultsDir: 'allure-results' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // No browser needed — tests here use the apiClient fixture directly.
      name: 'api',
      testDir: './tests/api',
      use: {
        baseURL: API_BASE_URL,
      },
    },
    {
      name: 'ui',
      testDir: './tests/ui',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: FRONTEND_BASE_URL,
      },
    },
    {
      // Route-interception-mocked UI specs — kept out of tests/ui so it's always
      // obvious whether a given test exercises the real backend. See docs/adr/0001.
      name: 'ui-mocked',
      testDir: './tests/ui-mocked',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: FRONTEND_BASE_URL,
      },
    },
    {
      name: 'visual',
      testDir: './tests/visual',
      // Never mask a real visual regression behind a retry.
      retries: 0,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: FRONTEND_BASE_URL,
        viewport: { width: 1280, height: 720 },
        reducedMotion: 'reduce',
      },
      expect: {
        toHaveScreenshot: {
          maxDiffPixelRatio: 0.01,
          animations: 'disabled',
        },
      },
    },
    {
      name: 'a11y',
      testDir: './tests/a11y',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: FRONTEND_BASE_URL,
      },
    },
  ],
});
