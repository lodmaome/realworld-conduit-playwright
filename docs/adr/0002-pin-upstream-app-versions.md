# 0002: Pin upstream app versions to a commit SHA

- Status: Accepted
- Date: 2026-09-18

## Context

The application under test (Angular frontend: `realworld-apps/angular-realworld-example-app`;
backend: `realworld-apps/aspnetcore-realworld-example-app`) is not vendored into this
repo — `docker-compose` builds each service directly from the upstream repo's own
Dockerfile. Both repos are under active, independent maintenance we don't control.

Docker Compose supports building from a git context either on a moving branch
(`build: https://github.com/org/repo.git#main`) or pinned to an exact commit
(`build: https://github.com/org/repo.git#<sha>`).

## Decision

Pin both app repos to a specific commit SHA. Bumping either pin is a deliberate,
reviewable change (a one-line diff to `docker-compose.yml` with a commit message
explaining why), not something that happens automatically.

## Consequences

**Positive**

- CI is reproducible: a green run today stays green tomorrow regardless of what upstream
  maintainers push in the meantime.
- An upstream change that alters the RealWorld API contract or breaks a build can't take
  down this project's CI without warning — we only absorb it when we choose to bump.
- The bump itself becomes visible history: "updated backend pin to pick up X" is a clear,
  auditable event, which is useful in a portfolio repo meant to show engineering judgment.

**Negative**

- We can silently drift behind upstream fixes (including security patches to the sample
  app itself) until someone manually bumps the pin. Since this is a test target, not
  production software, that risk is low, but it's a real tradeoff, not a free lunch.
- Requires an explicit, periodic process to check for and apply upstream updates —
  otherwise the pin becomes accidentally permanent. This should be a documented, casual
  maintenance task (e.g., checked whenever picking this project back up), not automated
  away, since a bump should be reviewed for API/DOM changes before landing.

## Alternatives considered

- **Track `main`/`master` on both repos** — rejected. Both apps get real, active
  maintenance (that's precisely why they were selected — see the app-selection notes in
  the test strategy doc), which means the moving branch actually moves. A frontend DOM
  tweak or backend spec-compliance fix landing upstream mid-CI-run would break our tests
  for reasons entirely outside this repo, with no corresponding commit here to explain
  why. That's an unacceptable amount of noise for a portfolio project meant to
  demonstrate stability.

## Amendment, 2026-09-26: the periodic check exists

The Consequences above name two risks: drifting behind upstream fixes, and the pin becoming
"accidentally permanent" for want of a periodic process. Until now that process was a note. It is a
scheduled check now, and it keeps the decision above intact: it **reports and never bumps**.

**What it does.** `.github/workflows/pin-drift.yml` runs weekly (Mondays, 06:00 UTC) and on demand,
through `tools/ci/pin-drift.mjs`. For each pin it asks GitHub how far the upstream default branch has
moved. A pin is flagged when upstream has commits it lacks **and the oldest of them is more than 30
days old**, so new upstream commits aren't drift, but a month of ignoring them is. A pin whose commit
upstream no longer has (force-pushed or deleted), or that is no longer an ancestor of the upstream
tip, is flagged too. When a pin is flagged the workflow opens, or updates, one issue titled "Upstream
pins have drifted" with the size of the gap, where the changes are (by directory), the newest commits
and a compare link. When the pins are current again it closes that issue. A check that could not run
(an API error, a rate limit) fails the run instead of reporting "no drift".

**Measured, 2026-09-26.** Both pins are at their upstream tips today (the backend was bumped on
2026-08-19, the frontend on 2026-05-13, and neither has commits since), so the live answer is "current".
The other states were exercised against the real upstream API by pinning older commits: the backend
three commits back was **3 commits behind, oldest 49 days: drifted**, and with a 60-day threshold the
same pin was "behind, recently" and not flagged; the frontend three commits back was **135 days:
drifted**; a commit upstream doesn't have was "not found upstream"; a malformed pin was refused.
25 unit tests cover the states, the exactly-at-threshold boundary (30 days is not drift, 31 is), the
oldest-commit rule, history rewritten, and the API failures. Three mutation checks (the boundary, the
oldest-versus-newest rule, and ignoring a non-200 response) each failed the tests as they should; a
first attempt at the third had not applied and was redone.

**What I did not expect.** After many runs the tool hit GitHub's unauthenticated limit (60 requests an
hour) and exited 2 with a clear message instead of reporting "no drift", which is the behaviour the
workflow relies on. It uses the workflow's token, which raises the limit to 1,000 an hour.

**What it still does not do.** It doesn't say whether the upstream changes matter to this suite: it
lists where they are (`src/Conduit`, `tests/...`) and leaves the judgement to the reviewer who does
the bump, following the [runbook](../maintenance.md). It watches the two app pins, not Playwright, Node
or npm dependencies, which have their own checks. And it opens an issue in this repository, so it needs
`issues: write`, granted to that workflow only.
