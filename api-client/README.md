# api-client

The backend's contract, as data and as a typed client. Nothing here is hand-maintained where it
can be generated.

- **`openapi.json`**: the backend's OpenAPI spec, exactly as it serves it (`/swagger/v1/swagger.json`).
  Committed, so a contract change shows up as a real, reviewable diff.
- **`schema.d.ts`**: the TypeScript types `openapi-typescript` generates from `openapi.json`. Both
  files are regenerated together by `npm run generate:api-types` (against a running stack) whenever
  the backend pin in `docker/docker-compose.yml` is bumped, and `npm run test:tools` fails if they
  ever disagree. The types come from the saved JSON, not the URL, so they can't drift apart.
- **`contract.ts`**: validates real responses against `openapi.json` at run time (`ajv` 8). The
  published spec is incomplete (it declares only `200` responses, five operations with no body, and
  no `required` fields), so the validator adds labelled **supplements** from observation and says
  which source each check used. See
  [ADR-0015](../docs/adr/0015-validate-responses-against-the-contract.md), and
  `tests/api/spec-gaps.spec.ts`, which pins what the spec lacks and fails when it improves.
- **`client.ts`**: a small hand-written wrapper around Playwright's `APIRequestContext`.
  `send(method, path, options)` returns the status and parsed body whatever they are, for testing
  error responses. The typed methods (`register`, `login`, `createArticle`, ...) throw on a non-2xx,
  which is right for set-up. Add a typed method per endpoint as set-up needs one; tests of the API
  itself use `send`. Paths take no leading slash: the request context's base URL already ends in
  `/api/`, and a leading slash would discard it.

The generated types mark every field optional and nullable because the spec does, even though a
real response always includes them. `client.ts` narrows what set-up relies on; `contract.ts`'s
observed presence rules check the rest.
