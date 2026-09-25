# RealWorld (Conduit) Playwright Portfolio

A Playwright + TypeScript test automation portfolio against the RealWorld
("Conduit" Medium-clone spec) app, self-hosted via Docker Compose so CI fully
controls the test environment.

**Status: functional, visual-regression and accessibility suites (65 tests), tiered CI, a published report with trend history, and flake handling are in place.** Still to come: the rest of the `ui-mocked` flows (login and session failures, edge-case payloads), and the PR coverage-gap tool.

- **Live report:** <https://lodmaome.github.io/realworld-conduit-playwright/> (Allure, with trends)
- **Flake dashboard:** <https://lodmaome.github.io/realworld-conduit-playwright/flakes/> (published after each run on `main`)
- **[Test strategy](docs/test-strategy.md)** — what is tested, how, and the known limitations
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
  coverage-gap/  PR-diff coverage-gap flagger (built last)
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
