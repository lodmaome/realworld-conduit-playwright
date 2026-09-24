# 0001: API mocking strategy for UI tests

- Status: Accepted
- Date: 2026-09-18

## Context

Some UI tests need to exercise frontend behavior that's impractical or flaky to trigger
against the live backend — error responses, empty/edge-case payloads, loading states,
and cases where we deliberately don't want a test's pass/fail to depend on live backend
state. We need a mocking mechanism for exactly these tests, kept separate from the
functional UI suite that talks to the real, Dockerized backend.

Two realistic options:

1. **Playwright's native network interception** (`page.route()` / `context.route()`),
   built into the test runner, no extra dependency.
2. **MSW (Mock Service Worker)**, a standalone mocking library commonly used in
   component tests, Storybook, and app-dev environments.

## Decision

Use Playwright's native `route()`/`context.route()` interception. Mocked UI specs live
in their own `tests/ui-mocked/` folder (its own Playwright project), never mixed into
`tests/ui/`, so a reader can tell at a glance whether a given test asserts against the
real backend or a stubbed one.

## Consequences

**Positive**

- No extra runtime dependency, no service worker registration/lifecycle to manage.
- Same interception API works for both browser-driven and API-request-context tests.
- Mocked responses can be built from the same OpenAPI-generated types used by the real
  `apiClient` (see the API client setup in the test project), so a mocked payload and a
  real one can't silently drift into different shapes.
- One mental model for "what does this test intercept" instead of two mocking systems.

**Negative**

- MSW's handler-based approach is arguably more reusable outside Playwright (e.g. in a
  future component-test or Storybook setup); if this portfolio grows a component-testing
  layer later, that layer will need its own mocking setup rather than reusing this one.
- Route interception is Playwright-specific — the mocking code isn't portable to another
  test runner the way MSW handlers would be.

## Alternatives considered

- **MSW** — rejected as the primary mechanism. It's more associated with component/unit
  testing and app-dev mocking than E2E-level network interception, and would be a second
  mocking system to maintain alongside Playwright's built-in one for no functional gain
  at this project's scope.
- **Both, as parallel options** — rejected for v1: more surface area to maintain than a
  portfolio project needs. Revisit if a component-testing layer is ever added.
