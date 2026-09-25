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

- `run-all.mjs` — runs several npm scripts in order and keeps going after a failure, exiting
  non-zero if any failed. `test:full` uses it so a functional failure can't hide a visual one
  (`&&` stops at the first failure; `;` isn't portable to cmd.exe).
- `check-playwright-image.mjs` (`npm run check:playwright-image`) — fails if the Playwright
  version in `package.json` and the tag of the visual suite's Docker image differ; a mismatch
  doesn't fail loudly, it renders differently.

See [ADR-0008](../../docs/adr/0008-test-tiers-and-ci-triggers.md) and
[ADR-0009](../../docs/adr/0009-visual-regression-in-a-pinned-image.md).
