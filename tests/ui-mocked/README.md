# tests/ui-mocked

UI specs that intercept network calls via Playwright's `route()`/`context.route()`
instead of hitting the live backend — for error states, edge-case payloads, and
loading states that are impractical or flaky to trigger for real. See
[docs/adr/0001-api-mocking-strategy.md](../../docs/adr/0001-api-mocking-strategy.md).

Kept separate from `tests/ui/` so it's always obvious, from the folder alone,
whether a given test exercises the real backend or a stubbed one.

## Writing a spec

Call `mockApi({ ... })` before the first navigation. Fixed data comes from
`tests/support/sample-data.ts`; anything that should fail, or be slow, goes in `overrides`
([0013](../../docs/adr/0013-api-overrides-for-the-mocked-ui-project.md)):

- **A failure**: `{ method, path, status, body: apiErrors({ field: ['message'] }) }`, or
  `{ path, abort: true }` for a dropped connection.
- **A loading state**: give the override `until: gate.promise` from `deferred()`, assert the
  loading UI, then `gate.release()`. Never a timeout.
- **An unanswered request fails the test** at teardown, so a spec must stub everything the
  page calls.

Two things to know about this project's environment: external stylesheets are blocked, so
icon-only controls (the comment trash can) are empty and unclickable by the normal route, and
the article page renders two empty `.error-messages` lists until something fails
(`ArticlePage.errors` targets the messages, not the lists).

## Pinned frontend gaps

A spec marked `known-issue` asserts something the frontend does that a user would call a defect
(for example, a failed feed request leaving the page on "Loading articles..."). It is a
regression check, and it is meant to fail when the frontend gains the missing behaviour — at
which point rewrite it to assert the new behaviour. Each carries the date it was observed.
