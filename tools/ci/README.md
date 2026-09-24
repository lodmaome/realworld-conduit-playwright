# tools/ci

Small, dependency-free Node scripts the CI workflow (and developers) call through npm.

- `check-tags.mjs` (`npm run check:tags`) — fails on any test tag outside the agreed
  vocabulary (`@smoke`, `@quarantine`), or if no `@smoke` test exists. Tag-based selection
  fails silently on a typo, so this is what stands between `@smoek` and a test quietly
  dropping out of the smoke gate. It doesn't need the application running.
- `wait-for-app.mjs` (`npm run wait-for-app`) — blocks until the backend and frontend both
  answer, or fails naming which one didn't and why. Polled from outside because we don't
  control the upstream images and can't add a compose `HEALTHCHECK` to them.
  `WAIT_TIMEOUT_MS`, `API_BASE_URL` and `FRONTEND_BASE_URL` override the defaults.

See [ADR-0008](../../docs/adr/0008-test-tiers-and-ci-triggers.md).
