# 0017: Create `.env` and the backend's JWT signing key with one script

- Status: Accepted
- Date: 2026-11-04

## Context

The backend pin moved to upstream `8aa617a` ([0002](0002-pin-upstream-app-versions.md), amendment).
That commit replaced the legacy token scheme (upstream #151), and the new one refuses to start without
a real signing key. The container exits at startup with `Jwt:SigningKey must be a base64-encoded random
key of at least 32 bytes; default and placeholder keys are not allowed.` (seen in its log on
2026-11-04, when the key was missing).

Two places created `.env` with `cp .env.example .env`: the CI step "Start the application" and the
README quick start. A copied example leaves the key blank, so a pull request or a merge to `main` would
have failed at that step, and a new contributor's first `npm run docker:up` would have ended with an
exited backend container. A key cannot have a default in a committed file: upstream rejects placeholders
and patterned keys, and a committed key would be public anyway.

## Decision

One script makes the key, and CI and the README both call it: `tools/ci/setup-env.mjs`
(`npm run setup:env`).

- It creates `.env` from `.env.example` if `.env` is missing.
- It fills `JWT_SIGNING_KEY` with a fresh random key (32 bytes, base64) when the value is blank or the
  line is absent. An older `.env` has no such line.
- A key that is already there is left exactly as it is, so re-running is safe.
- The key is written to `.env` only: never to `.env.example`, and never printed. A new `.env` is
  owner-readable only on POSIX systems.
- `docker/docker-compose.yml` passes it to the backend as `Jwt__SigningKey`, and stops with a message if
  `JWT_SIGNING_KEY` is not set.

Every machine and every CI run makes its own key.

## Consequences

**Positive**

- How a key is made lives in one place (the success check "one definition site", applied to a secret).
  The workflow, the README and the `.env.example` comment point at the script and do not repeat a recipe.
- There is no secret to store or rotate, and nothing for a pull request from a fork to be denied: the
  stack is destroyed at the end of each run, and so is its key.
- The script is tested (13 unit tests in `tools/ci/setup-env.test.mjs`, run by `npm run test:tools`).
  Seven deliberate breakages of it were each caught by a failing test.

**Negative**

- Compose reads `.env` for every command, so a command like `docker compose logs` also needs the variable
  set, not only `docker:up`. Anyone with an older `.env` runs `npm run setup:env` once; the script adds
  the missing line. This follows from how Compose treats `${VAR:?message}`; the blank-value case was not
  exercised.
- A developer's `.env` now holds a secret-looking value. `.env` is git-ignored, and the example stays
  blank.
- The owner-only file mode is not exercised on Windows, which ignores it.

## Alternatives considered

- **An inline step in the workflow** (`openssl rand`, then `sed` into `.env`) — rejected. It is shorter,
  but the recipe would then live in three places: the workflow, the README and the `.env.example`
  comment.
- **A GitHub Actions secret** — rejected. It is a secret to create and rotate for a stack that lives for
  one job, and pull requests from forks do not receive secrets.
- **A fixed key committed in `.env.example` or as a compose default** — rejected. It would be a public
  signing key, it would have to be genuinely random to pass upstream's checks (which cannot prove
  randomness, so a committed key invites the habit of committing one), and secret scanners may flag it.

## Verification

A full-tier run on the fix branch (run #79, 2026-11-04) created `.env` with the script, started the
stack, and passed all four test tiers (231 tests). The log shows `.env created from .env.example` and
`JWT_SIGNING_KEY: generated a random key (not printed)`, and no key value. A pull request run has not
been seen yet.
