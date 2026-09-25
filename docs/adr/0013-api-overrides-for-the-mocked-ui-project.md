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
- The article and its comments load together, so when only the comments request fails (`500`) the
  article, which loaded fine, is not shown either.
- A single unbroken run of characters in an article body (a long URL, a hash) is not wrapped and
  widens the page: 400 characters gave a 5826px-wide page against 1280px. The same 400 characters
  split by spaces, and ordinary long text, did not (isolated one variable at a time, with a
  control, rather than assumed from a payload that changed several things at once).
- A profile that can't be loaded, whether missing (`404`) or failing (`500`), renders a blank page:
  no user, no articles, no message. The real-backend test of a missing profile
  (`tests/ui/profile.spec.ts`) is titled "shows an error" but asserts only that the username is
  hidden, so it can't see this; it is left as it is, and noted here rather than silently edited.
- Opening the editor for an article that doesn't exist (`404`) shows an empty editor, as if for a
  new article, with no error.
- A failed follow, and a failed favorite, leave the button and the count as they were, which is
  right, but tell the user nothing.
- When the request for another page of the feed fails, the list is replaced by "Loading
  articles..." for good: the articles already on screen and the page buttons are gone, so the user
  can't go back without reloading.

Other flows were checked too and behave correctly, so their tests assert the good behaviour and are
not labelled `known-issue`:

- A rejected comment (`422`) shows the server's message and keeps the typed text; a failed comment
  delete (`500`) shows the error and keeps the comment.
- A rejected sign-in (`422`) shows the server's message, stays on `/login` and keeps the email.
- A stored token the API rejects (`401` on `GET /user`) signs the visitor out: the header shows
  Sign in/Sign up, the auth state is `unauthenticated`, the token is removed from `localStorage`,
  and the feed still renders.
- Markup in an article is inert: a `<script>` never runs, an `onerror` handler is dropped, a
  `javascript:` link is rewritten to an `unsafe:` one, and a title containing `<b>` is shown as
  literal text. (An `<img>` and an `<i>` written in the body do render as elements, so raw HTML is
  allowed through the sanitizer, minus anything executable.) This is asserted as a rendering check
  on an edge-case payload, not as a security scan, which is out of scope for v1.
- A server error on publish (`500`) and on settings update (`500`) show the message, stay on the
  page and keep everything typed, including the tags; the button is usable again.
- Publish and Update Settings disable themselves while a request is in flight, and a second click
  sends nothing (see the measurement under Evidence).
- Pagination counts pages correctly at the boundaries (10 articles is one page, 11 is two, 20 is
  two, 21 is three), and moving to another page swaps the list for the loading message, then shows
  that page with its button marked current. A single page still shows one "1" button; that is a
  quirk, not asserted either way beyond the number of buttons.
- A user with no articles shows the empty message.

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

- **A double-click is not a double-submit, and Playwright's `dblclick()` is not a double-click.** A
  first version of the in-flight tests used `dblclick()` and failed with two requests on both
  pages. The button disables itself only after the JavaScript task that handled the first click,
  and `dblclick()` sends both clicks inside one task, which no mouse can. Measured by clicking
  twice from inside the page with a controlled gap: 0ms sent two requests on both pages; 1, 5, 10,
  16, 20, 33, 50 and 100ms (settings) and 5, 16, 50ms (editor) each sent one. So the guard works at
  any human timing, this is not a defect, and it is not pinned as one. The tests instead click,
  wait for the button to be disabled, try once more, and count the requests the browser sent.
  Recorded because the tempting conclusion, "the app has a double-submit bug", was wrong.
- **The first pagination probe read the page before it had rendered** and reported zero articles;
  it was rerun with a proper wait before anything was written from it.

Mutation checks covered the specs that assert something did _not_ happen. Each was run, failed as
expected, and was restored:

- Home feed: with the failing feed request made to succeed, "stays on the loading message" fails.
- Comments: with the failing comments request made to succeed, "renders nothing, not even the
  article" fails.
- Stale token: with the `401` override removed, the visitor stays signed in and the test fails.
- Inert markup: the inline-handler check was pointed at `src` instead of `on*` and failed, which
  shows it reaches the `<img>` it is meant to inspect; a `__pwned` global planted before the page
  loaded made the final check fail, which shows it can see a real one.
- Follow, favorite, failed page 2, profile `500` and the unknown-article editor: each was made to
  succeed (or the article made to exist) and its pinned test failed.
- The in-flight guard: one attempted mutation, asserting the button is _enabled_, passed, because
  that assertion is true before the button disables. That mutation was invalid, not the test. The
  evidence for the request-count assertion is the `dblclick()` run above, where it caught two
  requests.

## Consequences

**Positive**

- Error, loading and empty states can be tested without touching the backend or a clock.
- The frontend's missing error states are documented, dated, and covered by tests that will say
  when they change.
- Overrides ride on the existing `mockApi` fixture and unmatched-request rule; no new fixture.

**Negative**

- **Most pinned-gap tests assert a negative** (no error shown, nothing rendered). The frontend
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
