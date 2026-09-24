# 0008: Test tiers and CI triggers

- Status: Accepted
- Date: 2026-09-24

## Context

The project needs three different answers to "did we break anything?", at three
different costs: a pull request wants feedback in minutes, a merge to `main` wants broad
functional coverage, and a nightly run wants everything, including the slower visual and
accessibility suites.

Playwright selects tests by tag (`--grep`), which is easy to get subtly wrong:

- Tag-based selection fails **silently**. A typo such as `@smoek` doesn't error — the test
  just never runs in the smoke tier.
- If every test must carry an opt-in tier tag, a forgotten tag drops a test out of the
  gating tiers with no signal.
- Tier definitions written separately in a workflow file and in developers' heads drift.

## Decision

**Tag exceptions only; a tier is a selection rule, not a tag.** Two tags exist:

- `@smoke` — the critical-path subset: one happy path per feature area, no negative
  cases. Currently 10 of 38 tests, about 5 seconds.
- `@quarantine` — known-flaky tests, held out of every gating tier.

Everything else is simply a test, and belongs to the regression tier by default.

| Tier         | Selection                                                               | Runs on                  |
| ------------ | ----------------------------------------------------------------------- | ------------------------ |
| `smoke`      | `@smoke`, minus `@quarantine`                                           | pull requests            |
| `regression` | all functional projects (`api`, `ui`, `ui-mocked`), minus `@quarantine` | push to `main`           |
| `full`       | all projects, including `visual` and `a11y`, minus `@quarantine`        | nightly, manual dispatch |
| quarantine   | `@quarantine` only — non-blocking, on the `full` run                    | nightly                  |

**One definition, in `package.json`.** Each tier is an npm script (`test:smoke`,
`test:regression`, `test:full`, `test:quarantine`). The workflow only chooses which script
to call from the trigger, so a developer reproduces a CI tier locally with the same
command.

**The tag vocabulary is enforced.** `npm run check:tags` lists every test through
Playwright's JSON reporter and fails on any tag outside the allowed set, or if no
`@smoke` test exists. It runs in CI alongside typecheck and lint, in a job that doesn't
need the application running.

**Readiness is polled from outside.** `npm run wait-for-app` blocks until both the backend
(via its Swagger document, served only after the schema exists) and the frontend answer,
and fails with the reason if they don't. This replaces the in-container `HEALTHCHECK` that
[the compose file](../../docker/docker-compose.yml) can't provide for upstream images we
don't control.

## Consequences

**Positive**

- A forgotten tag is harmless: an untagged test still runs in regression and full. Only
  the opt-in `@smoke` can be forgotten, and that costs a gate test, not coverage.
- The typo failure mode is closed by `check:tags` rather than by discipline.
- Local and CI behaviour can't drift, because both call the same scripts.
- Pull requests get a fast gate without maintaining a parallel list of "which tests are
  quick".

**Negative**

- Smoke membership is a judgement call with no mechanical guard: nothing stops it growing
  until it's no longer fast. The "one happy path per feature area" rule is a convention,
  reviewed by hand.
- The `regression` tier names its projects explicitly, so a new functional project must be
  added to that script or it will only run nightly.
- Each CI run builds both application images from source (a .NET publish and a Bun/Angular
  build) with no layer cache yet. With a smoke run of about five seconds, those builds are
  expected to dominate a pull request's wall-clock time — not yet measured in CI.
- Quarantined tests run only on the nightly, so a quarantined regression can sit unnoticed
  for a day. Making flake rate visible over time is the separate flake-reporting work.
- CI installs Chromium with `playwright install` on the runner rather than running inside
  the Playwright container image. That is fine for functional tests, but the visual suite
  will need baselines produced in one pinned image used both locally and in CI.

## Alternatives considered

- **Opt-in tier tags on every test** (`@smoke`, `@regression`, `@full`) — rejected. Noisy
  boilerplate whose failure mode is a silently unrun test.
- **A Playwright project per tier** — rejected. Tiers cut across projects (`@smoke` spans
  `api` and `ui`), so projects and tiers would fight over the same axis.
- **Selecting tests by changed paths** — rejected for now; that belongs to the coverage-gap
  tool, which needs a mature suite to build on.
- **Tier selection in `playwright.config.ts`** — rejected. A config-level `grep` is invisible
  at the command line, so a run wouldn't say which tier it was.
