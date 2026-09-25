# tools/flake-report

Flake handling: retry **with reporting**, a flake budget, and quarantine that has to explain
itself. The design, the evidence, and what is not yet verified are in
[ADR-0012](../../docs/adr/0012-flake-handling.md); the how-to is in
[docs/maintenance.md](../../docs/maintenance.md#flaky-tests).

Plain ES modules with JSDoc, no dependencies. The logic is split into pure functions with unit
tests (`npm run test:tools`); the command-line entry points are thin.

## Recording

- `reporter.mjs` — a Playwright reporter (registered in `playwright.config.ts`). Writes one file
  per invocation into `flake-results/`: each test's outcome, its attempts, and the first line of
  each failed attempt's error. It never lets a reporting failure change a test outcome.
- `record.mjs` — builds that record from Playwright's objects, including a test id that is the same
  on Windows and Linux.
- `quarantine.mjs` — the `until YYYY-MM-DD: reason` format, shared by everything that reads it.

## Reporting a run

- `summary.mjs` — the job-summary block and one `::warning` annotation per flaky test. Reports
  only; never fails.

## History, dashboard and budget

- `analysis.mjs` — merges a run's parts into a history entry, and computes the offenders, the
  quarantine state and the budget from history. Holds the thresholds:

  | Constant         | Value | Meaning                                                       |
  | ---------------- | ----- | ------------------------------------------------------------- |
  | `WINDOW`         | 10    | a test's own most recent runs the budget looks at             |
  | `FLAKE_LIMIT`    | 3     | flakes in that window that put a test over budget             |
  | `WATCH_LIMIT`    | 2     | flakes worth watching                                         |
  | `RELEASE_STREAK` | 7     | passing runs before a quarantined test is a release candidate |
  | `HISTORY_LIMIT`  | 90    | runs of history kept                                          |

- `history.mjs` — reads and writes the parts and the history file. A corrupt history line is an
  error, not skipped: dropping history would look like a healthy run.
- `update-history.mjs` — adds the CI run to history and writes the dashboard. Called by
  `tools/ci/publish-allure-report.mjs`.
- `render.mjs` — the dashboard: one self-contained page, no scripts, no external requests,
  everything from test data escaped.
- `check-policy.mjs` — the flake budget. Fails when a test that isn't quarantined is over it.

## Rules about the suite itself

- `list-tests.mjs` — every test Playwright would run, with the same id the reporter uses, so what
  the code says can be matched with what history recorded.
- `validate.mjs` — the tag and quarantine rules `npm run check:tags` enforces.

Local runs write `flake-results/` too (gitignored); `npm run clean:results` removes it.
