# RealWorld (Conduit) Playwright Portfolio

A Playwright + TypeScript test automation portfolio against the RealWorld
("Conduit" Medium-clone spec) app, self-hosted via Docker Compose so CI fully
controls the test environment.

> **This portfolio was built with AI assistance in every part** — tests, page objects, CI,
> tooling and all documentation were written with Claude Code (each commit carries a
> `Co-Authored-By` trailer naming the model). The author set the scope, chose the application
> under test, reviewed the results and evidence, and decided what was committed and pushed.
> A second, **hands-on** portfolio by the same author is
> [playwright-qa-portfolio](https://github.com/lodmaome/playwright-qa-portfolio); the two are meant
> to be read together. How the AI-assisted work was directed, checked and kept honest is in
> [How this was built](docs/how-this-was-built.md).

|                        | This repo                                                                                         | [playwright-qa-portfolio](https://github.com/lodmaome/playwright-qa-portfolio)                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How it was built       | AI-assisted throughout; human-directed and reviewed                                               | Hands-on                                                                                                                                                                                                                         |
| Application under test | RealWorld "Conduit", self-hosted with Docker Compose from pinned upstream commits                 | [SauceDemo](https://www.saucedemo.com) (UI) and [DummyJSON](https://dummyjson.com) (API), public sites                                                                                                                           |
| Suites                 | API, UI (real backend), UI with mocked failures, visual, accessibility                            | UI end-to-end, API contract (Zod), visual, accessibility (including keyboard navigation)                                                                                                                                         |
| Browsers               | Chromium only, stated as a limitation                                                             | Chromium, Firefox and WebKit                                                                                                                                                                                                     |
| Emphasis               | A controlled, reproducible environment; decision records with evidence; flake handling; tiered CI | Its own [architecture](https://github.com/lodmaome/playwright-qa-portfolio/blob/main/docs/ARCHITECTURE.md), [strategy](https://github.com/lodmaome/playwright-qa-portfolio/blob/main/docs/TEST-STRATEGY.md) and environment docs |

**Status: functional, visual-regression and accessibility suites (211 tests), tiered CI, a published report with trend history, flake handling, and a PR coverage-gap flagger are in place.** Nothing in the v1 scope is outstanding. The `ui-mocked` project (43 tests) covers the failure paths of every page; what it doesn't cover is listed in the [test strategy](docs/test-strategy.md).

- **Live report:** <https://lodmaome.github.io/realworld-conduit-playwright/> (Allure, with trends)
- **Flake dashboard:** <https://lodmaome.github.io/realworld-conduit-playwright/flakes/> (published after each run on `main`)
- **[Test strategy](docs/test-strategy.md)** — what is tested, how, and the known limitations
- **[Findings](docs/findings.md)** — the 19 defects and gaps this suite found in the app, each with a reproduction
- **[How this was built](docs/how-this-was-built.md)** — the AI-assisted process, who did what, and how it was checked
- **[Architecture decisions](docs/adr/README.md)** — read before changing anything that would contradict them
- **[Maintenance runbook](docs/maintenance.md)** — bumping pins, quarantining a test, troubleshooting

## Target application

- Frontend: [`realworld-apps/angular-realworld-example-app`](https://github.com/realworld-apps/angular-realworld-example-app) (Angular, TypeScript)
- Backend: [`realworld-apps/aspnetcore-realworld-example-app`](https://github.com/realworld-apps/aspnetcore-realworld-example-app) (.NET, EF Core)

Both are built from their upstream source at a pinned commit (see
[ADR-0002](docs/adr/0002-pin-upstream-app-versions.md)), not vendored into this repo.
The frontend needs a small patch to point it at a self-hosted backend — see
[ADR-0005](docs/adr/0005-frontend-custom-docker-build.md) before assuming a routine
Docker setup. The backend currently only runs against SQLite regardless of its own
`docker-compose.yml` — see [ADR-0006](docs/adr/0006-backend-database-provider.md).

## Quick start

```bash
cp .env.example .env
npm install
npm run docker:up
```

This builds and starts the frontend (`http://localhost:4200`) and backend
(`http://localhost:8080/api`, Swagger at `/swagger`). Containers starting is not the
app being ready, so block until both actually answer:

```bash
npm run wait-for-app
```

```bash
npm run lint
npm run typecheck
npm test          # needs the stack from `npm run docker:up` to be running
```

## Test tiers

Tests are selected by tier, and CI picks the tier from what triggered the run
([ADR-0008](docs/adr/0008-test-tiers-and-ci-triggers.md)). Only `@smoke` and
`@quarantine` are tags; every other test is regression by default.

| Command                   | Runs                                                | CI trigger      |
| ------------------------- | --------------------------------------------------- | --------------- |
| `npm run test:smoke`      | the happy path of each feature area                 | pull request    |
| `npm run test:regression` | all functional tests (`api`, `ui`, `ui-mocked`)     | push to `main`  |
| `npm run test:a11y`       | accessibility scans against the recorded violations | (part of full)  |
| `npm run test:visual`     | screenshots, run inside the pinned Playwright image | (part of full)  |
| `npm run test:full`       | regression + a11y + visual                          | nightly, manual |
| `npm run test:quarantine` | known-flaky tests only, never blocking              | nightly         |

`npm run check:tags` fails on any tag outside that vocabulary, so a typo can't quietly
drop a test out of the smoke run.

## Reports

CI publishes an Allure report with trend history to GitHub Pages after each run on `main`
([ADR-0011](docs/adr/0011-allure-report-publishing.md)). To build one locally:

```bash
npm run clean:results     # results append across runs; start clean
npm run test:smoke        # or any tier
npm run allure:generate
npm run allure:open
```

Local reports carry no history; only the CI publish step records it.

## API coverage gaps

A pull request that changes the API contract (`api-client/schema.d.ts`) or the backend pin gets a
report of which changed endpoints no test reaches
([ADR-0014](docs/adr/0014-pr-coverage-gap-flagger.md)). It records the API requests the `api`,
`ui` and `ui-mocked` suites send, so nothing needs annotating. To run it yourself:

```bash
npm run coverage:record                       # run those suites with recording on
npm run coverage-gap -- --base origin/main    # what this branch changed, and whether tests reach it
npm run coverage-gap -- --all                 # every endpoint in the contract
```

It reports and does not block, and "reached" is not "verified": see
[tools/coverage-gap](tools/coverage-gap/README.md).

## Project structure

```
tests/
  fixtures/     the one shared base fixture every suite extends
  api/          API-only specs, no browser
  ui/           functional UI specs, real backend
  ui-mocked/    UI specs mocked via Playwright route interception
  visual/       visual regression, in the pinned image
  a11y/         accessibility scans, recorded as a ratchet
  support/      API stubs, fixed sample data and the scenes both suites share
pages/          page objects, exposed as fixtures
factories/      test data builders — every test gets unique data
api-client/     typed client generated from the backend's OpenAPI spec
tools/
  coverage-gap/  flags changed API endpoints no test reaches: recorder runner, manifest, diff, report
  flake-report/  flake reporter, history, dashboard and budget, plus the tag and quarantine rules
  ci/            readiness wait, report generation and publishing, and the tag check
docker/         docker-compose.yml, the frontend's Dockerfile, and the pinned Playwright image
docs/           test strategy, maintenance runbook, and adr/ (architecture decision records)
```

Each of the directories above has its own short README explaining its role.

## Why these choices

Every non-obvious decision (mocking strategy, dependency pinning, package manager,
report hosting, the Docker adaptations the target apps required, page objects and locators,
tiers, the pinned visual image, the a11y ratchet, flake handling) is recorded in
[docs/adr/](docs/adr/README.md) with its context, the evidence, and the tradeoffs — read there
before changing any of them.
