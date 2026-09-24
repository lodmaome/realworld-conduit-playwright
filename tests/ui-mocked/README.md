# tests/ui-mocked

UI specs that intercept network calls via Playwright's `route()`/`context.route()`
instead of hitting the live backend — for error states, edge-case payloads, and
loading states that are impractical or flaky to trigger for real. See
[docs/adr/0001-api-mocking-strategy.md](../../docs/adr/0001-api-mocking-strategy.md).

Kept separate from `tests/ui/` so it's always obvious, from the folder alone,
whether a given test exercises the real backend or a stubbed one.
