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
- **"Exactly N requests"**: use `recordRequests(page, method, pathname)` from
  `tests/support/app-settled.ts`; it counts what the browser sent.
- **Double-submit**: don't use `dblclick()`. It sends both clicks in one JavaScript task, which
  no mouse can, and the buttons disable themselves after that task, so it reports a defect that a
  person can't trigger (measured, see ADR-0013). Click, wait for the button to be disabled, try
  again.
- **"Is there an error / an active tab?"**: count elements, don't read their text. Several
  containers are always in the markup, empty or hidden (the `.error-messages` lists, the hidden
  tag tab that also carries `active`), so `allInnerTexts()` shows a blank entry that looks like
  "nothing". Page objects target the individual messages and the visible tab; see ADR-0013.
- **Lists of articles**: `articleSeries(n)` in `sample-data.ts` gives `n` distinct articles for
  pagination.

Two things to know about this project's environment: external stylesheets are blocked, so
icon-only controls (the comment trash can) are empty and unclickable by the normal route, and
the article page renders two empty `.error-messages` lists until something fails
(`ArticlePage.errors` targets the messages, not the lists).

## Pinned frontend gaps

A spec marked `known-issue` asserts something the frontend does that a user would call a defect
(for example, a failed feed request leaving the page on "Loading articles...", or an unbroken
long word widening the page). It is a
regression check, and it is meant to fail when the frontend gains the missing behaviour — at
which point rewrite it to assert the new behaviour. Each carries the date it was observed.
