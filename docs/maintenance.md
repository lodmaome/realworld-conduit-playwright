# Maintenance runbook

How to keep this project healthy: the recurring chores, the ones that only look routine, and what
to do when something breaks. Every command here has been run in this repository.

Commands assume the stack is up (`npm run docker:up`, then `npm run wait-for-app`) and, on
Windows, that Docker Desktop is running.

## Everyday

| To                       | Run                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Start the app under test | `npm run docker:up`, then `npm run wait-for-app`                                     |
| Run a tier               | `npm run test:smoke` / `test:regression` / `test:full`                               |
| Run one suite            | `npm run test:ui`, `test:api`, `test:a11y`, `test:visual`                            |
| Static checks            | `npm run typecheck && npm run lint && npm run format:check && npm run check:tags`    |
| Tool unit tests          | `npm run test:tools`                                                                 |
| Start from clean results | `npm run clean:results`                                                              |
| Build a report locally   | `npm run clean:results`, run tests, `npm run allure:generate`, `npm run allure:open` |

## Adding things

**A page object:** a class in `pages/` (locators public, no assertions), a fixture in
`tests/fixtures/base.ts`, and add it to the `pages` bundle. See
[ADR-0007](adr/0007-fixture-composed-page-objects.md) for the locator order and the pitfalls.

**A visual and a11y scene:** add an entry to `tests/support/scenes.ts` (its stubs, how to open it,
what proves it rendered). Both suites pick it up. Then `npm run test:visual:update` and
`npm run test:a11y:update`, and review the new baseline image and record before committing.

**A test that must not gate:** see _Quarantining a test_ below. Never delete a flaky test to make
the run green, and never leave a bare `@quarantine` tag: the static check will refuse it.

## Bumping things

### The upstream frontend or backend pin

The pins are commit SHAs in `docker/docker-compose.yml` ([ADR-0002](adr/0002-pin-upstream-app-versions.md)).
A bump is deliberate, and the checks depend on which side moved.

**Knowing when to bump.** A weekly workflow (`pin-drift.yml`) opens an issue, "Upstream pins have
drifted", when upstream has commits a pin lacks and the oldest is more than 30 days old, or when
upstream no longer has the pinned commit; it closes the issue when the pins are current again. It only
reports. To check by hand: `GITHUB_TOKEN=$(gh auth token) node tools/ci/pin-drift.mjs` (without a token
GitHub allows 60 requests an hour), `--pin backend=<sha>` to see the gap to a commit you are
considering, and a manual dispatch of the workflow with "open_issue" unticked is a dry run
([ADR-0002](adr/0002-pin-upstream-app-versions.md), amendment).

1. Find the new SHA on the upstream default branch (`main` for the frontend, `master` for the
   backend) and change it in the compose file.
2. **Frontend: prove the API URL patch still took effect.** It matches one exact string in one file
   and matches _nothing silently_ if upstream refactors it ([ADR-0005](adr/0005-frontend-custom-docker-build.md)).
   After `npm run docker:up`:

   ```bash
   docker compose --env-file ./.env -f docker/docker-compose.yml exec -T frontend sh -c 'grep -rl "api.realworld.show" /usr/share/nginx/html'
   ```

   This must print nothing and exit 1. The same command with `localhost:8080/api` must print a
   file. (The `sh -c` matters on Windows: Git Bash otherwise rewrites the container path.)

3. **Backend:** re-read `src/Conduit/Program.cs` for the database wiring. If upstream has
   re-enabled the environment-variable provider switch, [ADR-0006](adr/0006-backend-database-provider.md)
   needs revisiting. Then `npm run generate:api-types`, which rewrites both `api-client/openapi.json`
   and `schema.d.ts`; review the diff of both: a contract change is meant to show up there.
   **Don't skip the regeneration**: the coverage-gap flagger can only see a changed endpoint through
   `schema.d.ts`, and warns on a pull request that moves the backend pin without touching it. The API
   suite validates real responses against `openapi.json` with strict schemas, so a field the backend
   added or retyped fails a named test; that is the contract change surfacing, so update the test or
   the supplement in `api-client/contract.ts`. If `tests/api/spec-gaps.spec.ts` fails, the published
   spec got better: delete the supplement it names
   ([ADR-0015](adr/0015-validate-responses-against-the-contract.md)). A pinned backend defect
   (`known-issue`) that starts failing means it was fixed: rewrite the test to assert the fix.
   After `npm run coverage:record`, `npm run coverage-gap -- --base origin/main` lists the added or
   changed endpoints no test reaches ([ADR-0014](adr/0014-pr-coverage-gap-flagger.md)); CI does the
   same on the pull request.
4. `npm run test:full`. Expect the visual baselines and a11y records to move if the frontend's
   markup or styling changed; review those diffs, don't just regenerate them.

### Playwright

The library and the visual suite's Docker image must be the same version, or the browser build
won't match ([ADR-0009](adr/0009-visual-regression-in-a-pinned-image.md)).

1. Change `@playwright/test` in `package.json` to the new **exact** version (no caret).
2. Change the tag in `docker/playwright/Dockerfile` (`FROM mcr.microsoft.com/playwright:v<version>-noble`).
3. `npm install`, then `npx playwright install chromium firefox webkit` (a new version needs new builds of
   all three engines; the cross-browser smoke needs Firefox and WebKit, [0016](adr/0016-cross-browser-smoke.md)),
   then `npm run check:playwright-image` (CI runs it too and fails on a mismatch).
4. **Regenerate every visual baseline**, because a new browser build renders slightly differently:
   `npm run test:visual:update`. Look at the images in the diff before committing.
5. Re-check the a11y records (`npm run test:a11y`); they should not move.

### Node, and other dependencies

`.nvmrc` is the single source for the Node version, used locally and by CI. `typescript` is held at
5.9.x because `typescript-eslint` doesn't support 7.x yet; revisit when it does. The Ubuntu runner
is pinned to `ubuntu-24.04` ([ADR-0008](adr/0008-test-tiers-and-ci-triggers.md)); bump it by hand
when GitHub announces the next `ubuntu-latest`.

## Flaky tests

The dashboard is at `/flakes/` on the published site, and every run's summary lists the tests that
needed a retry. When a test goes over the budget, or you decide it should stop gating:

### Quarantining a test

```ts
import { quarantined } from '../support/quarantine';

test(
  'shows the feed',
  quarantined('2026-11-15', 'race with the tag index, see #12'),
  async ({ page }) => {
    // ...
  },
);
```

The date is a deadline: `npm run check:tags` fails the day after it. Extend it only in a reviewed
change with a reason. A quarantined test still runs every night without blocking, and the dashboard
shows how it is doing. Quarantining also exempts the test from the flake budget, so the fix that
quarantines it doesn't keep failing `main` for ten more runs.

### Releasing a test

When the dashboard marks it a **release candidate** (7 passing nights in a row), remove the
`quarantined(...)` argument and the test rejoins the gating tiers. If it flakes again it will go
over the budget again, which is the point.

### Reading a budget failure

The run fails with `Over the flake budget`, naming the test. The dashboard shows how often it
flaked and the first error of the latest flake. Either fix the cause, or quarantine it as above.

### Rehearsing the publish path

To try the report, flake history, dashboard or budget without touching the real history, dispatch the
workflow on any branch with `publish_branch` set to a rehearsal branch:

```bash
gh workflow run ci.yml --ref <your-branch> -f tier=smoke -f publish_branch=gh-pages-rehearsal
```

The publisher writes to that branch (created on the first run) and the real `gh-pages` is not
touched. A dispatch on a branch other than `main` with the default `publish_branch` publishes
nothing. Only `gh-pages` and `gh-pages-<name>` are accepted, because the publisher force-pushes.
Rehearsal branches are not served by Pages: fetch `flakes/index.html` from the branch to look at the
dashboard. When you are done, delete the rehearsal branch. See the amendment to
[ADR-0012](adr/0012-flake-handling.md) for a worked example (a test that flakes on purpose).

## When something breaks

| Symptom                                                            | Cause and fix                                                                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `failed to connect to the docker API`                              | Docker Desktop isn't running. Start it, wait for the daemon                                                                                         |
| A visual test fails with "must run in the pinned Playwright image" | You ran the visual project directly on the host (`npx playwright test --project=visual`). Use `npm run test:visual`, which runs it in the container |
| A visual test fails with a small pixel diff                        | A real change, or the baseline is from another image. Open the diff in the report; never regenerate to make it pass without looking                 |
| An a11y test fails with a diff of `rule (impact) xCount` lines     | A new violation (regression) or a fixed one (record is stale). Attached `axe-violations.json` has the selectors                                     |
| A local report shows tests you didn't just run                     | Results append across runs. `npm run clean:results` first                                                                                           |
| `allure generate` produces an old report                           | It doesn't clean its output; use `npm run allure:generate`, which does                                                                              |
| Ports 4200 or 8080 already in use                                  | Change `FRONTEND_PORT` / `BACKEND_PORT` in `.env`, and `API_BASE_URL` / `FRONTEND_BASE_URL` to match                                                |
| The tag check fails on a quarantine                                | Expired, malformed, or missing its reason. The message says which and where                                                                         |
| The publish job fails on the analytics check                       | Allure's report template changed. Update the strip in `tools/ci/generate-allure-report.mjs`; do not publish with the check disabled                 |

## CI, in one place

`.github/workflows/ci.yml`. Triggers and tiers: pull request → smoke, push to `main` → regression,
nightly and manual → full ([ADR-0008](adr/0008-test-tiers-and-ci-triggers.md)). After the tests, a
`report` job on `main` publishes the Allure report and the flake dashboard to the `gh-pages`
branch, serialised so two runs never race on history
([ADR-0011](adr/0011-allure-report-publishing.md)), then checks the flake budget.

GitHub Pages serves `gh-pages` at the repository's Pages URL; if the report ever disappears, check
Settings → Pages still points at that branch. The branch is force-pushed as a single commit each
time, so don't work on it by hand.
