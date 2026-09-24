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
