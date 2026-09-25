# Test strategy

What is tested, how, and why it is built this way. The individual decisions and their evidence
are in the [ADRs](adr/README.md); this is the map that ties them together.

## What is under test

The RealWorld "Conduit" app: an Angular frontend and an ASP.NET Core backend, each built from
upstream source at a **pinned commit** and run under Docker Compose, so CI controls the whole
environment instead of depending on a live third-party site
([0002](adr/0002-pin-upstream-app-versions.md)). We don't own either codebase, which shapes
everything else:

- We can't add `data-testid` attributes, so locators follow what the markup offers
  ([0007](adr/0007-fixture-composed-page-objects.md)).
- The frontend hardcodes its API origin and ships no Dockerfile, so ours patches it at build time
  ([0005](adr/0005-frontend-custom-docker-build.md)).
- The backend can only run on SQLite whatever its own compose file suggests, so tests are isolated
  by unique data, not by the database ([0006](adr/0006-backend-database-provider.md)).
- Its accessibility defects are unfixable by us, so the a11y suite records them instead of
  demanding zero ([0010](adr/0010-a11y-as-a-ratchet-on-recorded-violations.md)).

## The suites

| Suite       | Proves                                                                                                           | Data                                 | Runs                    | Tests |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------- | ----- |
| `api`       | The REST contract, through a typed client generated from the backend's OpenAPI spec                              | Real backend                         | Runner                  | 1     |
| `ui`        | User journeys end to end: auth, articles, comments, favorites, feed and pagination, profile and follow, settings | Real backend, set up through the API | Runner                  | 37    |
| `visual`    | The pages look the same: a screenshot per scene at zero pixel tolerance                                          | Fixed stubs                          | Pinned Playwright image | 10    |
| `a11y`      | No new accessibility violations (axe, WCAG 2.0/2.1 A and AA), and none silently fixed                            | Fixed stubs                          | Runner                  | 10    |
| `ui-mocked` | UI behaviour the real backend can't easily produce (errors, edge payloads)                                       | Route interception                   | Runner                  | 7     |

The visual and a11y suites share one list of ten "scenes" (a page in a state), so they can't drift
apart on coverage. Both render from stubs typed from the OpenAPI schema, with external fonts and
icon CSS blocked, so a difference means the app changed, never the data, the clock or the internet
([0009](adr/0009-visual-regression-in-a-pinned-image.md)).

## Data and isolation

All parallel workers share one database, so **every test owns its data**: users, articles and
tags are generated unique per test (`factories/`), state is set up through the API rather than by
clicking through the UI, and where a test needs a deterministic list it tags its articles and
opens the tag's page. Nothing assumes a seeded user or an empty feed.

## Pitfalls this design avoids

| Pitfall                                           | How                                                                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brittle locators                                  | Role, then placeholder, then shared theme classes; never generated `_ngcontent-*` attributes. Positional locators, `force: true` and `waitForTimeout` are lint errors |
| Icon glyphs leaking into accessible names         | Name matching for icon buttons goes through `iconLabel()`; found by running against the real page, not by reading the markup                                          |
| Hard sleeps, races                                | Web-first assertions; readiness comes from the app's own test hook or a response, never a clock                                                                       |
| Tests depending on each other                     | Unique data per test; no shared login state (`authenticatedPage` seeds a fresh user's token, once)                                                                    |
| Environment drift in screenshots                  | One pinned image, locale, timezone and colour scheme fixed, animations off; the suite refuses to run elsewhere                                                        |
| A tag typo silently dropping a test from the gate | `check:tags` fails on any tag outside the vocabulary                                                                                                                  |
| A retry hiding an unreliable test                 | Every retry is recorded, shown, trended, and budgeted ([0012](adr/0012-flake-handling.md))                                                                            |
| A quarantine that lives forever                   | It needs a reason and an expiry, and fails the static check when it lapses                                                                                            |

## Tiers and CI

Tests are selected by tier, not by tagging everything ([0008](adr/0008-test-tiers-and-ci-triggers.md)):
**smoke** (one happy path per feature area) on pull requests, **regression** (all functional
tests) on pushes to `main`, **full** (adding a11y and visual) nightly and on demand. Each tier is
an npm script, so a developer reproduces a CI run with the same command. Only `@smoke` and
`@quarantine` are tags. A fast static job (types, lint, format, tag and quarantine rules, tool
unit tests, image pin) runs alongside on every trigger.

## Reliability

CI retries a failed test once, and **reports every test that needed it**. A test that flakes 3
times in its last 10 runs fails the run unless it is quarantined, and a quarantine must say why
and until when. History and a dashboard are published with the report
([0012](adr/0012-flake-handling.md)).

## Reporting

An Allure report with trend history, and the flake dashboard, are published to GitHub Pages after
each run on `main` ([0011](adr/0011-allure-report-publishing.md)). Failures are grouped by cause:
visual diff, changed accessibility record, failed backend call, missing stub, unreachable
environment, timeout.

## Known limitations

Stated plainly, because a strategy that hides its gaps isn't one.

- **One browser.** Everything runs on Chromium. The icon-glyph behaviour behind `iconLabel()` was
  verified only there, so adding Firefox or WebKit means re-checking it.
- **Visual and a11y don't touch the backend.** They render from stubs. Real-backend integration is
  the `ui` suite's job; nothing checks at run time that the real API still returns what the stubs
  assume, beyond types generated from its spec.
- **Screenshots aren't production-faithful.** With the external stylesheets blocked, text is the
  image's fallback fonts and icon glyphs are absent, so an icon-font regression isn't caught.
- **`ui-mocked` is partly built.** It covers the home feed and the article page (loading, empty,
  and failed requests; rejected and failed comments). Login and session failures, and edge-case
  payloads, are not covered yet. Three of its tests pin frontend behaviour that a user would call
  a defect (no error state for a failed feed or an unknown article), asserted as observed and
  labelled `known-issue`; since they assert that something did not happen, and the app gives no
  signal to wait on, they narrow that window rather than close it
  ([0013](adr/0013-api-overrides-for-the-mocked-ui-project.md)).
- **Accessibility is the machine-checkable subset.** No keyboard, focus-order or screen-reader
  testing, and placeholder-only form fields pass because axe accepts a placeholder as a name.
- **The flake budget sees only `main`**, and no real flake has yet occurred to exercise the
  dashboard on live data.
- **Out of scope for v1**, deliberately: mutation testing, security scanning, performance and load,
  cross-browser and mobile.

## What is not built yet

The PR coverage-gap tool: given a pull request's diff, flag changed endpoints with no test that
reaches them.
