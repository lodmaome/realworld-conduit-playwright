# tests/api

API-only specs — no browser involved. Use the `apiClient` fixture from
`tests/fixtures/` directly against the backend's REST endpoints (the typed client
lives in `api-client/`, generated from the backend's OpenAPI/Swagger spec).

Tag a spec `@smoke` only if it's the happy path for a feature area. Untagged specs are
the regression tier by default. `@smoke` and `@quarantine` are the only tags, and
`npm run check:tags` fails on anything else — see
[ADR-0008](../../docs/adr/0008-test-tiers-and-ci-triggers.md).
