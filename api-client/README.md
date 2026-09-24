# api-client

Typed HTTP client generated from the backend's OpenAPI/Swagger spec
(`openapi-typescript`) rather than hand-maintained. A backend contract change either
regenerates cleanly or breaks the generation step loudly — never drifts silently the
way hand-written response interfaces would.

The backend serves its spec at `/swagger/v1/swagger.json` once running. Regenerate
`schema.d.ts` against it with `npm run generate:api-types` whenever the backend pin
in `docker/docker-compose.yml` is bumped — the file is checked in rather than
generated on every install so a contract change shows up as a real, reviewable diff.

`client.ts` is a small hand-written wrapper around Playwright's `APIRequestContext`
using the generated types for request/response shapes — not a fully generic
OpenAPI-path-typed client. Add a method per endpoint as tests need it.
