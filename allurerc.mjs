// History is opt-in: only the CI publish job sets ALLURE_HISTORY_PATH. A local `allure
// generate` appends an entry every time it runs, so writing history by default would fill
// it with duplicates of whatever you last ran. See docs/adr/0011-allure-report-publishing.md.
const historyPath = process.env.ALLURE_HISTORY_PATH;

export default {
  name: process.env.ALLURE_REPORT_NAME ?? 'RealWorld Conduit',
  output: './allure-report',
  ...(historyPath ? { historyPath, historyLimit: 60 } : {}),

  // Sorts failures by cause, so a red run says at a glance whether the app changed or the
  // environment broke. Anything that fits no rule lands in Allure's built-in "Product errors".
  // There is deliberately no "flaky" category: Allure marks a test flaky only when the adapter
  // says so or its recent history alternates, and allure-playwright doesn't flag a test that
  // passed on retry — retries show under the report's Retry filter instead.
  categories: [
    {
      name: 'Visual regression',
      matchedStatuses: ['failed'],
      messageRegex: '.*toHaveScreenshot.*',
    },
    {
      name: 'Accessibility violations changed',
      matchedStatuses: ['failed'],
      messageRegex: '.*toMatchSnapshot.*',
    },
    {
      name: 'Backend or API call failed',
      matchedStatuses: ['failed', 'broken'],
      messageRegex: '.*(register|login|getCurrentUser|createArticle|addComment) failed: \\d+.*',
    },
    {
      name: 'Missing API stub',
      matchedStatuses: ['failed', 'broken'],
      messageRegex: '.*API requests with no stub.*',
    },
    {
      name: 'Environment unreachable',
      matchedStatuses: ['failed', 'broken'],
      messageRegex: '.*(ECONNREFUSED|ERR_CONNECTION|net::ERR_).*',
    },
    {
      name: 'Timeouts (possible flake)',
      matchedStatuses: ['failed', 'broken'],
      messageRegex: '.*(Test timeout of \\d+ms exceeded|Timeout \\d+ms exceeded).*',
    },
  ],

  plugins: {
    awesome: {
      options: {
        reportLanguage: 'en',
        // The trend charts need history to mean anything; without it they show one point.
        charts: [
          { type: 'currentStatus', title: 'Current status' },
          { type: 'statusDynamics', title: 'Status over recent runs', limit: 30 },
          { type: 'statusTransitions', title: 'Tests that changed status', limit: 30 },
          { type: 'durationDynamics', title: 'Duration over recent runs', limit: 30 },
          {
            type: 'stabilityDistribution',
            title: 'Stability by project',
            groupBy: 'label-name:parentSuite',
            threshold: 90,
          },
        ],
      },
    },
  },
};
