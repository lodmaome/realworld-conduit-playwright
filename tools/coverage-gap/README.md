# tools/coverage-gap

The PR coverage-gap flagger: which **changed** API endpoints does no test reach?
Design and evidence: [ADR-0014](../../docs/adr/0014-pr-coverage-gap-flagger.md).

## Use

```bash
npm run coverage:record                       # run api + ui + ui-mocked with recording on
npm run coverage-gap -- --base origin/main    # what this branch added or altered, and whether tests reach it
npm run coverage-gap -- --all                 # the whole contract, no base needed
```

Options: `--fail-on-gap` (exit 1 if a changed endpoint is reached by no test; off by default),
`--hits <dir>` (default `endpoint-hits`), `--real-projects api,ui`, `--api-projects api` (the
projects whose direct API-client calls are the thing under test rather than set-up),
`--summary <file>` (defaults to `$GITHUB_STEP_SUMMARY`). Exit codes: `0` a report was produced, `1` gaps with `--fail-on-gap`, `2`
the tool couldn't give an honest answer (no recorded hits, an unreadable base ref, a schema it
can't parse). In CI it runs on pull requests that touch `api-client/schema.d.ts` or the compose
file, and nowhere else.

## How it works

1. **Recording** (`tests/support/endpoint-hits.ts`, wired in `tests/fixtures/base.ts`). When
   `RECORD_ENDPOINT_HITS` is set, every API request a test sends is noted, from the browser
   context and from the `apiClient`, and written as one JSON file per test attempt under
   `endpoint-hits/<project>/`. Requests made inside a factory, or during the `authenticatedPage`
   bootstrap, are flagged `setup`. Off otherwise. `record.mjs` sets the variable (a runner, because the
   `VAR=value cmd` syntax doesn't work in cmd or PowerShell).
2. **The manifest** (`manifest.mjs`). Every operation in `schema.d.ts`, with a fingerprint of its
   definition plus every schema it refers to, transitively.
3. **The diff** (`diff.mjs`). Operations added, removed, or whose fingerprint changed.
4. **The analysis** (`analysis.mjs`, `match.mjs`). Recorded requests are matched back to
   operation templates; only passing tests count; `api` and `ui` are real, everything else is
   "stubbed". A real request is **driven** when the test sent it and **set-up** when a fixture did
   (a factory, the auth bootstrap, or the API client inside a UI test). An operation is `covered`
   (a real test drives it), `only used to set up`, `only stubbed`, or `no test reaches it`.
5. **The report** (`render.mjs`, `cli.mjs`). Markdown for the job summary, one `::warning`
   annotation per gap, and a warning when the backend pin moved (`pin.mjs`) but the schema didn't.

## What it does not tell you

"Driven" is not "verified": a test can send a request and assert nothing about the answer, and
the browser asks for some endpoints on page load for a test that is looking at something else. It
sees only what the OpenAPI schema shows, so behaviour that leaves the schema alone is invisible. It
is not a test selector. The report says the first of these; the ADR says the rest.

## Tests

`npm run test:tools` runs the unit tests (`*.test.mjs`). `sample-schema.mjs` builds a small
schema in openapi-typescript's output shape for them.
