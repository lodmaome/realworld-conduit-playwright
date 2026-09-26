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

| Suite       | Proves                                                                                                                         | Data                                                 | Runs                    | Tests |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------- | ----- |
| `api`       | The REST contract: statuses, validation, authorisation and data lifecycles, each response checked against the OpenAPI contract | Real backend (plus offline contract and stub checks) | Runner                  | 111   |
| `ui`        | User journeys end to end: auth, articles, comments, favorites, feed and pagination, profile and follow, settings               | Real backend, set up through the API                 | Runner                  | 37    |
| `visual`    | The pages look the same: a screenshot per scene at zero pixel tolerance                                                        | Fixed stubs                                          | Pinned Playwright image | 10    |
| `a11y`      | No new accessibility violations (axe, WCAG 2.0/2.1 A and AA), and none silently fixed                                          | Fixed stubs                                          | Runner                  | 10    |
| `ui-mocked` | UI behaviour the real backend can't easily produce (errors, edge payloads)                                                     | Route interception                                   | Runner                  | 43    |

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

| Pitfall                                           | How                                                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brittle locators                                  | Role, then placeholder, then shared theme classes; never generated `_ngcontent-*` attributes. Positional locators, `force: true` and `waitForTimeout` are lint errors              |
| Icon glyphs leaking into accessible names         | Name matching for icon buttons goes through `iconLabel()`; found by running against the real page, not by reading the markup                                                       |
| Hard sleeps, races                                | Web-first assertions; readiness comes from the app's own test hook or a response, never a clock                                                                                    |
| Tests depending on each other                     | Unique data per test; no shared login state (`authenticatedPage` seeds a fresh user's token, once)                                                                                 |
| Environment drift in screenshots                  | One pinned image, locale, timezone and colour scheme fixed, animations off; the suite refuses to run elsewhere                                                                     |
| A tag typo silently dropping a test from the gate | `check:tags` fails on any tag outside the vocabulary                                                                                                                               |
| A retry hiding an unreliable test                 | Every retry is recorded, shown, trended, and budgeted ([0012](adr/0012-flake-handling.md))                                                                                         |
| A changed endpoint nobody tests                   | The coverage-gap flagger lists changed endpoints no real-backend test reaches, and warns when a backend pin moved without the schema ([0014](adr/0014-pr-coverage-gap-flagger.md)) |
| A quarantine that lives forever                   | It needs a reason and an expiry, and fails the static check when it lapses                                                                                                         |

## Tiers and CI

Tests are selected by tier, not by tagging everything ([0008](adr/0008-test-tiers-and-ci-triggers.md)):
**smoke** (one happy path per feature area) on pull requests, **regression** (all functional
tests) on pushes to `main`, **full** (adding a11y and visual) nightly and on demand. Each tier is
an npm script, so a developer reproduces a CI run with the same command. Only `@smoke` and
`@quarantine` are tags. A fast static job (types, lint, format, tag and quarantine rules, tool
unit tests, image pin) runs alongside on every trigger. Separately, a weekly job reports when an
upstream app pin has fallen behind for long enough to look at, and never bumps one
([0002](adr/0002-pin-upstream-app-versions.md), amendment).

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

## The API contract

The backend's OpenAPI spec is committed (`api-client/openapi.json`), the types are generated from it,
and the `api` suite validates every real response against it at run time
([0015](adr/0015-validate-responses-against-the-contract.md)). The published spec is thinner than
the backend: it declares only `200` for every operation, no response body for five of them, and no
`required` field anywhere. So checks are labelled by source, the published `openapi` schema or a
`supplement` we wrote from observation, and a test fails when the spec improves enough to retire one.
The stub layer the visual, a11y and mocked-UI suites run on is checked against the same contract,
offline, so those suites can't go green on stubs that drifted from the backend. Backend defects the
suite found are pinned as observed and labelled `known-issue`.

## Endpoint coverage gaps

A pull request that changes the API contract (`api-client/schema.d.ts`) or the backend pin gets a
report of which changed endpoints no test reaches. Every API request the api, ui and ui-mocked
suites send is recorded (nothing to annotate), matched to the contract, and counted only if a
passing real-backend test sent it, and only if the test itself did rather than a factory or the auth
bootstrap preparing it; an endpoint only used to set up, or only stubs reach, is called out separately
([0014](adr/0014-pr-coverage-gap-flagger.md)). It reports and does not block. Locally:
`npm run coverage:record`, then `npm run coverage-gap -- --base origin/main` (or `--all`).

## Non-goals

Decided against, as opposed to a limitation (something wanted and not possible). The first two were
excluded by the original brief; what each would take is in [future work](future-work.md).

| Not done                                  | Why                                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mutation testing                          | The code under test is upstream's and pinned; a mutant per Docker rebuild is hours for a signal that is mostly about code this repository doesn't own      |
| Security scanning, or a security review   | A demo app it doesn't own, so findings would be upstream's. Authorisation and token behaviour are tested as functionality, and the findings page says so   |
| Performance and load testing              | The app is a demo on SQLite in Docker on a shared CI runner; timings from it wouldn't mean anything, and load is a different question with different tools |
| Cross-browser and mobile                  | Chromium only, by choice; the icon-glyph handling was verified only there. The hands-on portfolio covers cross-browser                                     |
| Testing the app's own code                | No unit tests or code coverage of the backend or frontend: both are pinned upstream builds, tested through the UI and the API                              |
| Running against a hosted third-party site | Controlling the environment is the point ([0002](adr/0002-pin-upstream-app-versions.md), [0005](adr/0005-frontend-custom-docker-build.md))                 |
| Fixing the app's defects                  | Defects are reported ([findings](findings.md)), not patched: the app is pinned so that CI doesn't move under the tests                                     |
| Being a framework others install          | It is a portfolio to read and run, not a published package                                                                                                 |

## Known limitations

Stated plainly, because a strategy that hides its gaps isn't one.

- **One browser.** Everything runs on Chromium. The icon-glyph behaviour behind `iconLabel()` was
  verified only there, so adding Firefox or WebKit means re-checking it.
- **Visual and a11y don't touch the backend.** They render from stubs. Real-backend integration is
  the `ui` suite's job; nothing checks at run time that the real API still returns what the stubs
  assume, beyond types generated from its spec.
- **Screenshots aren't production-faithful.** With the external stylesheets blocked, text is the
  image's fallback fonts and icon glyphs are absent, so an icon-font regression isn't caught.
- **`ui-mocked` covers the failure paths of every page, but not every failure.** Covered: the home
  feed (loading, empty, failed, Your Feed, pagination boundaries and page changes, the popular
  tags, a failed favorite), the article page (failed and rejected comments, a missing article, a
  failed delete, favorite or follow, hostile and very long content), registration, sign-in and
  session failures, the editor and settings (server errors, the in-flight guard), and the profile
  (empty, unloadable, a failed follow, the Favorited Posts tab). Not covered: the success paths of
  writes (the real-backend suite owns those), a dropped connection anywhere but the home feed, and
  slow responses beyond the ones named above.
- **Seventeen of its tests pin frontend behaviour a user would call a defect**, asserted as
  observed and labelled `known-issue`. The recurring one is that a failed request for a list, a
  page, a tab or the tags leaves "Loading ..." on screen for good, with no error; others are a
  blank page for an unknown article, profile or editor target, a failed delete, follow or favorite
  that tells the user nothing, and a long unbroken word widening the page. Sixteen of the
  seventeen assert that something did not happen, and the app gives no signal to wait on, so they
  narrow that window rather than close it
  ([0013](adr/0013-api-overrides-for-the-mocked-ui-project.md)).
- **One real-backend test overpromises.** `tests/ui/profile.spec.ts` ("a profile that does not
  exist shows an error") only asserts the username is hidden; the app shows no error. Noted, not
  changed.
- **Accessibility is the machine-checkable subset.** No keyboard, focus-order or screen-reader
  testing, and placeholder-only form fields pass because axe accepts a placeholder as a name.
- **The coverage-gap flagger measures whether a test drives an endpoint, not whether it checks the
  answer.** It separates a test's own requests from a fixture's set-up, but a driven request can
  still go unasserted; it sees only what the OpenAPI schema shows (a behaviour change that leaves the
  contract alone is invisible); and the per-endpoint test counts are approximate for requests a page
  fires on load, so the status is the part to trust
  ([0014](adr/0014-pr-coverage-gap-flagger.md)).
- **The flake budget sees only `main`**, enforced: the report job publishes to the real history
  only from `main`, and other branches can only rehearse into a `gh-pages-<name>` branch. The
  flake tooling has been rehearsed on real CI runs with a deliberate flake (retry reporting, history,
  the watch notice, the budget failure, quarantine, the dashboard), but not with a real, unplanned
  one, the job-summary block has not been seen rendered, and the release-candidate state has only
  run locally ([0012](adr/0012-flake-handling.md)).

## What is not built yet

Nothing in the v1 scope. What was left out on purpose is under [non-goals](#non-goals), what is
possible but not done is under [known limitations](#known-limitations), and what would come next is in
[future work](future-work.md).
