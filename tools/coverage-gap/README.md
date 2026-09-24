# tools/coverage-gap

The PR-diff coverage-gap flagger. Design direction: record every endpoint each test
actually hits during a run (via the `apiClient`/`page` fixtures — no manual
annotation), diff a PR against the backend's endpoint manifest (derived from
OpenAPI) to find changed endpoints, and flag any changed endpoint with zero recorded
hits across the whole suite.

Built last, deliberately — it depends on the OpenAPI-derived endpoint manifest and a
stable test/tag structure that don't exist yet. Not implemented.
