# 0005: Custom Dockerfile and build-time API URL patch for the frontend

- Status: Accepted
- Date: 2026-09-18

## Context

[0002](0002-pin-upstream-app-versions.md) assumed both app repos would be built
straight from their own upstream Dockerfile at a pinned commit. Inspecting the
frontend repo (`realworld-apps/angular-realworld-example-app`) at the pinned commit
(`dd99ed2cf39c805d719f943c5d7061a5683d98a8`) surfaced two problems with that
assumption:

1. **No Dockerfile exists in the repo.** There is nothing to build from directly.
2. **The backend URL is hardcoded with no override.** `src/app/core/interceptors/api.interceptor.ts`
   clones every outgoing request to `https://api.realworld.show/api` unconditionally —
   there's no environment variable, build config, or runtime injection point to point
   it at a different backend.
3. **The production build depends on a git submodule for assets.** `angular.json`
   reads its theme CSS and SVG assets from `realworld/assets/...` (a checked-in
   submodule path), so a shallow, submodule-less checkout would fail to build, not
   just fail its own test suite.

## Decision

Maintain our own Dockerfile at `docker/frontend/Dockerfile`:

- Clone the pinned commit with `git` (not Docker's native `ADD <git-url>#<sha>`
  shorthand), specifically because we need `git submodule update --init --recursive`,
  which the ADD-git shorthand doesn't reliably provide.
- Patch the hardcoded API origin via a build-ARG-driven `sed` immediately after
  checkout, before `bun install`/`bun run build`.
- Build with Bun, then serve the static output through `nginx:alpine` in a second
  stage (the app is a pure client-side SPA — no SSR config in `angular.json` — so
  static hosting is correct, not a simplification).

## Consequences

**Positive**

- Still no vendoring of their app source into our repo history — the Dockerfile only
  references the upstream repo and clones it at build time.
- The one adaptation this app needs (the hardcoded URL) is patched in exactly one,
  clearly commented place, not worked around with a network-level hack.

**Negative**

- The `sed` patch has an implicit dependency on the exact file path and exact
  hardcoded string in the pinned commit. If a future `FRONTEND_REF` bump refactors
  that interceptor, the patch will silently match nothing rather than fail the build —
  bumping the pin must include re-verifying the patch still takes effect, not just
  that the image builds.
- The build stage needs `git` installed via `apt-get`, which depends on
  `oven/bun:1`'s current Debian-based image; if that base image ever changes, this
  step needs revisiting.

## Alternatives considered

- **Docker's native `ADD <git-url>#<sha>`** — rejected. Its submodule handling is not
  reliably documented, and this app's build genuinely depends on its submodule for
  more than tests (see context above); an unreliable checkout here fails the whole
  build in a confusing way.
- **A runtime reverse proxy** rewriting requests to `api.realworld.show` toward the
  local backend (DNS override or a proxy in front of the frontend container) —
  rejected as more moving parts for a worse result: still fragile, and network traces
  during a demo would show a confusing external hostname instead of the real backend.
