# 0016: Cross-browser smoke: the `ui` smoke tests in Firefox and WebKit, in the full tier

- Status: Accepted
- Date: 2026-09-26

## Context

Everything ran on Chromium, and the [test strategy](../test-strategy.md) listed that as a limitation
with a specific worry: the icon-glyph behaviour behind `iconLabel()` "was verified only there", so
adding another engine would mean re-checking it. The hands-on
[playwright-qa-portfolio](https://github.com/lodmaome/playwright-qa-portfolio) covers cross-browser,
which is why this one left it out, but it left a gap in this suite's own claims.

The constraints are the ones that shaped the tiers ([0008](0008-test-tiers-and-ci-triggers.md)): the
pull-request tier is a fast gate, the `ui` suite is the largest and slowest, and the visual suite's
baselines are Chromium-specific and rendered in a pinned image ([0009](0009-visual-regression-in-a-pinned-image.md)).

## Decision

**Two projects, `ui-firefox` and `ui-webkit`, run the `@smoke` tests of `tests/ui`.** They reuse the
existing tests through a project-level `grep`, so there is no copy of any test and no new tag: the
vocabulary stays `@smoke` and `@quarantine`. The nine smoke tests, one happy path per feature area,
now also run in Firefox 155 and WebKit 26.6 (the builds Playwright 1.63 ships).

**They run in the full tier only.** `npm run test:cross-browser` is part of `test:full` (nightly and
on demand). Pull requests and pushes stay Chromium-only: `test:smoke` now names its projects, so it is
still exactly 10 tests, and CI installs Firefox and WebKit only when the tier is `full`.

**The script caps workers at 2.** See the evidence: at the machine's default parallelism the two
engines together produced Firefox teardown timeouts.

**What stays Chromium-only:** the rest of `ui` (28 tests), `ui-mocked`, `a11y` and `visual` (whose
baselines are per-engine and pinned, [0009](0009-visual-regression-in-a-pinned-image.md)). Mobile
devices are not covered; that is a different question from engine differences.

## Evidence

Measured 2026-09-26 on a 20-core Windows machine against the running stack.

- **Each project runs in its own engine.** A temporary probe test read the user agent in each: the
  `ui` project reported Chromium 153, `ui-firefox` Firefox 155 (Gecko), `ui-webkit` WebKit 26.6. A
  project quietly running the wrong engine is the standard way to get a cross-browser suite that
  proves nothing, so this was checked before anything else.
- **All 18 tests (9 per engine) passed on the first attempt**, and `npm run test:cross-browser` takes
  about 22 seconds.
- **The icon-glyph worry does not hold.** The accessible names of the article page's icon buttons were
  printed in all three engines: identical, glyph included (`" Follow <user>"`,
  `" Favorite Article (0)"`), and the computed `::before` content of the icon elements is the same in
  all three. Playwright computes accessible names itself, which is why. `iconLabel()`, which tolerates
  the glyph being present or absent, is not Chromium-specific, and the strategy's claim was corrected
  with this measurement.
- **The plumbing reports a failure that exists in one engine only.** A temporary test that fails on
  WebKit only made the run fail (exit code 1) with the failure in `ui-webkit`'s artifacts and the other
  two engines passing.
- **Flakiness, measured by repetition.** Running the 18 tests five times each (90 runs):

  | Setup                                                | Result                                                    |
  | ---------------------------------------------------- | --------------------------------------------------------- |
  | Default parallelism (10 workers), video on, 4 rounds | 4, 1, 3 and 3 failures of 90                              |
  | Default parallelism, video off, 2 rounds             | 4 and 15 failures of 90                                   |
  | 2, 3 and 6 workers                                   | **0 failures of 90 at each**; 107 s, about 90 s and 120 s |
  | Chromium, same 10 workers, 90 runs                   | 0 failures                                                |
  | Firefox alone, 10 workers, 54 runs                   | 0 failures                                                |

  Every failure had one message: `Tearing down "context" exceeded the test timeout of 30000ms`, in
  Firefox, after the test body had passed. **My first hypothesis was wrong:** I suspected the video
  recording configured for every test, and turning it off produced as many failures or more. The pattern
  fits load, since two heavy engines plus the Docker backend on one machine at 10 workers, and 10
  workers was also slower (2.2 minutes) than 3 (1.5). The exact mechanism inside Firefox was not
  identified; the mitigation is the worker cap, and 540 runs at the default against 270 runs below it
  is the basis for it.

## Consequences

**Positive**

- Each feature area's happy path is checked nightly in three engines, and the icon-glyph claim is now a
  measurement.
- No test was copied and no tag was added: a smoke test is one test in three projects.
- A flaky Firefox test is tracked separately by the flake budget, because test ids include the project
  ([0012](0012-flake-handling.md)).

**Negative**

- **It is smoke only.** Nine tests per engine say each area works, not that every behaviour does. An
  engine-specific bug in a non-smoke test is invisible.
- **A failure in Firefox or WebKit shows up nightly, not on the pull request that caused it.**
- **WebKit here is Playwright's build, not Safari.** It is the same engine family, not the same browser
  on macOS or iOS.
- **`check:tags` counts every copy.** The 10 distinct smoke tests read as "28 @smoke" (10 in Chromium
  plus 9 in each of two engines), because the listing counts each project's run.
- **The worker cap is a finding about one machine.** CI's default is 2 workers, so it was probably not
  affected, and the cap makes that deterministic; the repeated measurements were local, and the CI
  runner has one passing run.
- **Two more browsers to keep current:** a Playwright bump needs new builds of both.

**Verified on CI, and what that does not show**

- **On Linux (`ubuntu-24.04`), 2026-09-26.** A push to `main` stayed Chromium-only (191 tests, and the
  "Install Firefox and WebKit" step skipped). A full-tier dispatch
  ([36212302862](https://github.com/lodmaome/realworld-conduit-playwright/actions/runs/36212302862))
  installed both engines with `playwright install --with-deps`, ran the cross-browser smoke, and passed:
  191 regression, 10 a11y, 10 visual and **18 cross-browser tests in 26.5 seconds at 2 workers**, 229 in
  all. The flake history recorded 229 passed and 0 flaky, and the budget was OK.
- **It is one run.** It shows the setup works on the runner, not that Firefox and WebKit are stable
  there; the repeated measurements above were taken locally. The flake budget will show that over the
  nightly runs.

## Alternatives considered

- **All of `ui` in three engines:** rejected for now. It triples the time of the largest suite for a
  signal that is mostly duplicate; smoke is the cheapest thing that answers "does each area work in
  each engine". If smoke ever finds an engine difference, widen it.
- **A `@cross-browser` tag:** rejected. It is a third tag for what `@smoke` already says, and
  [0008](0008-test-tiers-and-ci-triggers.md) keeps the vocabulary to two.
- **Running it on every pull request:** rejected. It adds the two engine downloads and their run time
  to the fastest gate, for a class of failure that is rare; nightly is enough to notice.
- **Mobile device emulation (`devices['iPhone ...']`):** rejected. It changes the viewport and user
  agent, not the engine, so it would not answer this question and is a separate one.
- **A real-Safari or hosted-device service:** out of scope for a self-contained repository.
