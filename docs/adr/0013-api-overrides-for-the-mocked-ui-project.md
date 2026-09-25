# 0013: Per-request overrides for the mocked UI project, and pinning frontend gaps

- Status: Accepted
- Date: 2026-09-25

## Context

[0001](0001-api-mocking-strategy.md) chose Playwright's own route interception for the
`ui-mocked` project, and the stub layer (`tests/support/api-mock.ts`) was built for the visual and
a11y suites: fixed data, every response a `200`, `GET` only. Anything else got a `501`, and the
`mockApi` fixture fails a test at teardown if a request went unanswered.

That is the wrong shape for what `ui-mocked` is for. The project exists for behaviour the real
backend can't easily produce: a failing request, a slow one, a rejected write. So the stub layer
needed a way to answer one request differently from the fixed stubs, and a rule for how the tests
built on it stay deterministic.

## Decision

**An `overrides` list on `ApiMockConfig`.** Each entry names a method (default `GET`), a path
(string, exact, or regex) and optionally query parameters, and answers with either a status and
body or a dropped connection. Overrides are checked before the fixed stubs and the first match
wins. They are the only way to answer a non-`GET` request. A request nothing answers is still a
`501` that fails the test at teardown, so a missing stub stays loud.

**A held response is released by the test, not by a timer.** An override can carry
`until: Promise`; the route waits on it. `deferred()` gives a test the promise and a `release()`.
"Loading articles..." is therefore asserted while the request is provably still pending and the
test moves on when it says so. A `delay: 2000` would have been a sleep with a nicer name, and
would be either slow or flaky.

**`apiErrors()` builds the error body**, `{ errors: { field: [messages] } }`. The shape was checked
against the live backend on 2026-09-25 rather than assumed: a `422` on invalid registration, a
`404` on an unknown article and a `401` on `GET /user` without a token all return it.

**Frontend gaps are pinned, labelled, and named for what they assert.** Where the frontend does
something a user would call a defect, the spec asserts the behaviour as it is, carries a
`known-issue` annotation, and has a comment saying when it was observed and what to do when it
fails. We don't own the frontend, so the choices were to skip the test, to assert the behaviour we
wish it had (a permanently red test, or one that is quarantined forever), or to record what it
does. Recording it gives a regression check today and a test that fails, on purpose, the day the
frontend gains an error state. Observed on 2026-09-25:

- A failed home-feed request (a `500`, or a dropped connection) leaves the page on
  "Loading articles..." indefinitely: no error, no articles.
- An unknown article (`404`) renders a blank page: no title, no body, no message.

Comment failures were checked too, and behave correctly: a rejected comment (`422`) shows the
server's message and keeps the typed text, and a failed comment delete (`500`) shows the error and
keeps the comment.

## Evidence

The behaviour above came from running throwaway probe specs against the real frontend, not from
reading its source, and the specs were written from what the probes printed. Two things the
probes got wrong are worth keeping:

- **The article page always renders two `.error-messages` lists**, empty until something fails.
  A probe printed the lists' text, which is the empty string for "no list" and for "an empty
  list" alike, and concluded there was no list on the 404 page. The first real assertion failed
  with a strict-mode violation on two elements. `ArticlePage.errors` now targets the individual
  messages (`.error-messages li`), which can tell "no error" from "an error". Nothing else used
  the old locator.
- **The trash icon can't be clicked** in this project. The stub layer blocks the Ionicons
  stylesheet on purpose ([0009](0009-visual-regression-in-a-pinned-image.md)), so the icon is an
  empty `<i>` with no size and Playwright reports it as not visible. It has no role or name to
  target instead. The delete spec dispatches the click to the element, which gives up the
  visibility check for that one click, and says so where it does it; the comment being visible
  before and after is asserted.

A mutation check covered the pinned-gap specs: with the feed request made to succeed, "stays on
the loading message" fails, so the assertion is sensitive to the failure it describes.

## Consequences

**Positive**

- Error, loading and empty states can be tested without touching the backend or a clock.
- The frontend's missing error states are documented, dated, and covered by tests that will say
  when they change.
- Overrides ride on the existing `mockApi` fixture and unmatched-request rule; no new fixture.

**Negative**

- **The pinned-gap tests assert a negative** (no error shown, nothing rendered). The frontend
  exposes no hook for feed or article state, only auth, so there is nothing to wait for. The specs
  wait for the request to end and for two animation frames (`tests/support/app-settled.ts`), which
  narrows the window in which the assertion could pass too early without closing it. The mutation
  check above is the evidence it isn't hollow; it is not a proof.
- **Override bodies are `unknown`**, so an error body isn't checked against the OpenAPI schema the
  way the fixed stubs are. `apiErrors()` and the live check above are the substitute.
- **A pinned gap is a test that expects a defect.** If it is left when the frontend is fixed, it
  fails, which is the intent, but someone has to read the comment and rewrite it.
- **One stub already differs from the real API**: `GET /user` without a user answers `401` with
  `{}`; the real body is `{"errors":{"token":["is missing"]}}`. Nothing renders it, so it was left
  alone rather than re-verifying the visual and a11y suites for a cosmetic change.

## Alternatives considered

- **A `delay` in milliseconds** instead of `until`: rejected, a fixed wait is a sleep in a
  different place.
- **Per-test `page.route()` calls** in each spec: rejected. The fixed stubs, the CORS handling
  (the API is cross-origin, and `authorization` must be listed explicitly) and the unmatched-request
  check would be duplicated, or skipped, in each one.
- **Skipping the tests for the frontend's gaps**, or **asserting the behaviour a good frontend
  would have**: rejected for the reasons above.
- **Making the trash icon clickable** by allowing the Ionicons stylesheet through: rejected, it
  would make rendering depend on the internet again for the sake of one click.
