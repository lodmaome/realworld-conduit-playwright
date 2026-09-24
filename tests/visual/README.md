# tests/visual

Visual regression specs. Reuse the same page objects as `tests/ui/` — a visual test
is a functional test that ends in `toHaveScreenshot()` instead of a functional
assertion, not a parallel set of hand-copied locators.

Baselines must only ever be generated inside this project's own Docker image
(`npm run test:visual:update` run against the Dockerized frontend) — never compare a
locally-generated screenshot against a CI-generated one. Font rendering and
anti-aliasing differ enough between machines to produce false failures.
