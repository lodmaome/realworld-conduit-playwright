# tools/flake-report

Custom reporter that records retry attempts per test (Playwright's
`testResult.retry`) into a flake-rate store over time, plus the `@quarantine` tag
convention for known-flaky tests that shouldn't block CI while still being run and
tracked.

Not implemented yet. `retries: 1` in `playwright.config.ts` (CI only) is today's
blind stopgap until this exists — see the comment there.
