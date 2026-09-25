import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

// Visual and a11y run against fixed stub data, so the browser environment must be as fixed
// as the data: a screenshot of a date rendered in the runner's timezone would differ per host.
const deterministicBrowser = {
  locale: 'en-US',
  timezoneId: 'UTC',
  colorScheme: 'light',
} as const;

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
        ...deterministicBrowser,
        viewport: { width: 1280, height: 720 },
        reducedMotion: 'reduce',
      },
      expect: {
        // No pixel tolerance: the pinned image and fixed stub data make renders identical, so
        // any difference is a real change. (Playwright still applies its default per-pixel
        // colour threshold.)
        toHaveScreenshot: {
          animations: 'disabled',
        },
      },
    },
    {
      name: 'a11y',
      testDir: './tests/a11y',
      // Violation records are text, identical on every OS — no per-platform suffix.
      snapshotPathTemplate: '{testDir}/known-violations/{arg}{ext}',
      use: {
        ...devices['Desktop Chrome'],
        ...deterministicBrowser,
        baseURL: FRONTEND_BASE_URL,
      },
    },
  ],
});
