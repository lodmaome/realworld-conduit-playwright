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

**The workflow, run on GitHub Actions the same day.** Five dispatches covered every path:

| Run                                   | What it did                                            | Result                                                                             |
| ------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 36209281122 (`main`, dry run)         | The real pins, issue management off                    | Both "current"; every issue step skipped                                           |
| 36209329015 (throwaway branch)        | Backend pinned three commits back, issue management on | "3 commits, oldest 49 days: drifted"; issue #3 opened; a warning annotation        |
| 36209375066 (throwaway branch)        | The same again                                         | "Updated issue #3"; still exactly one open tracking issue                          |
| 36209399275 (`main`)                  | The real pins, issue management on                     | "Every pin is at its upstream tip"; issue #3 closed with an explanatory comment    |
| 36209427231 (`main`, threshold "abc") | A check that cannot run                                | The run **failed** at its last step with an error annotation; no issue was touched |

The issue body was read back: its links are absolute and resolve (they would have been dead
relative links inside an issue, which is why the report takes a base URL in Actions). The throwaway
branch was deleted afterwards, and issue #3 stays as a closed record of the rehearsal.

**An unexpected limit.** After many runs the tool hit GitHub's unauthenticated limit (60 requests an
hour) and exited 2 with a clear message instead of reporting "no drift", which is the behaviour the
workflow relies on. It uses the workflow's token, which raises the limit to 1,000 an hour.

**What it still does not do.** It doesn't say whether the upstream changes matter to this suite: it
lists where they are (`src/Conduit`, `tests/...`) and leaves the judgement to the reviewer who does
the bump, following the [runbook](../maintenance.md). It watches the two app pins, not Playwright, Node
or npm dependencies, which have their own checks. And it opens an issue in this repository, so it needs
`issues: write`, granted to that workflow only.

## Amendment, 2026-11-05: the pin fixes the source, not the build

The first Consequence above says "CI is reproducible: a green run today stays green tomorrow regardless
of what upstream maintainers push in the meantime." That held for the source and not for the build, and
the nightly run showed it.

**What happened.** The nightly run on `main` was green every day from 2026-09-26 to 2026-10-14 (run #57
was the last) and red from 2026-10-15 (#58) on. At the time of writing that is 22 red scheduled runs: #58
to #78, and #80 on 2026-11-05 (#79 was a manual run on the fix branch, which passed). The repository did
not change in between: every one of those runs built commit `4ccf4ef`, and the pins were untouched. The
backend image stopped building. `dotnet restore` failed with `NU1902` and `NU1903` for
`System.Security.Cryptography.Pkcs` 9.0.4, which the pinned backend appears to pull in indirectly (the
pinned commit's `Directory.Packages.props` does not name it). Two advisories for that package were
published on 2026-10-13 (GHSA-846f-f764-76mx and GHSA-2fmv-rv2c-59x7), NuGet checks packages against
advisory data when it restores, and the upstream build treats warnings as errors
(`Directory.Build.props`), so a warning became a failed build before any test ran. The first red run
came about a day after the advisories; that lag is inferred, not observed.

**Why a pin doesn't cover it.** The build reads things from outside the pinned commit. The advisory data
is one. The base-image tags in the upstream Dockerfile are another: the pinned commit used the floating
`sdk:10.0` and `aspnet:10.0`, and the image behind `sdk:10.0` changed between runs (though not between the
last green run and the first red one, so it was not the trigger). The apt packages installed in the
frontend image are not pinned either.

**What the weekly check does not do.** It reports commits, not broken builds, and flags a pin only when
the oldest commit it lacks is more than 30 days old. By that rule it would not have flagged this: the
oldest upstream commit after the pin is from 2026-10-05.

**Resolution.** The backend pin moved to upstream `8aa617abed5dd645f8f9d99578a3e07b4e2e52e7` (upstream
#161, "pin patched PKCS"): the smallest upstream commit that contains the fix, and one whose upstream API
checks passed. Its Dockerfile uses exact image versions (`sdk:10.0.402`, `aspnet:10.0.13`) and a locked
restore. A full-tier run on the fix branch passed (run #79, 2026-11-04). The nightly run on `main` stays
red until the branch merges: run #80 failed on the old pin with the same error. The bump also carried
upstream's fixes for the four defects this project reported ([findings](../findings.md)) and a new JWT
scheme that needs a signing key ([0017](0017-env-and-jwt-signing-key-setup.md)).

**Not solved.** A future advisory against any package the backend uses can fail the build the same way,
because the audit and the warnings-as-errors setting are still upstream's. This amendment does not decide
what to do about that, nor whether and how to be told when the nightly run goes red. Two options were
named and not taken: an alert on a red nightly, and our own Dockerfile for the backend that does not
fail on audit warnings, which is a step away from running the real, unmodified backend
([0006](0006-backend-database-provider.md)).
