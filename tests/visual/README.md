# tests/visual

Visual regression: one screenshot per scene from `tests/support/scenes.ts`, rendered from
fixed stub data inside the pinned Playwright image. Why it is built this way, and the
evidence it is stable, is in [ADR-0009](../../docs/adr/0009-visual-regression-in-a-pinned-image.md).

```bash
npm run test:visual          # compare against the baselines
npm run test:visual:update   # regenerate them — then review the image diff
```

These run in the `playwright` service from `docker/docker-compose.yml`, not on your machine.
Run on the host, the suite refuses to start and says so: a screenshot from your OS would
fail against CI's baselines.

Every spec imports `test` from [`visual-test.ts`](visual-test.ts), which carries that guard.

**Baselines** live in `scenes.spec.ts-snapshots/` as `<scene>-visual-linux.png`. Only
regenerate them when the app changed on purpose (or after bumping Playwright, which changes
the browser build), and read the diff before committing: an updated baseline that nobody
looked at is a regression accepted.

**What the images are, and aren't.** External fonts and icon CSS are blocked, so text is
the image's fallback fonts and icon glyphs don't appear. There is no pixel tolerance — a
change of a single digit fails.
