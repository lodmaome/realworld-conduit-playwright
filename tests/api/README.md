# tests/api

API-only specs, no browser. They call the backend through `apiClient.send()` and check every
response against the OpenAPI contract with `expectContract`
([ADR-0015](../../docs/adr/0015-validate-responses-against-the-contract.md)).

| File                           | What it covers                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `auth.spec.ts`                 | Registration, sign-in, token schemes, account updates, and the account defects         |
| `articles.spec.ts`             | Create, read, update, rename (the slug changes), delete, tags, and the article defects |
| `listing.spec.ts`              | Filters, newest-first paging, the feed, and pagination quirks                          |
| `comments.spec.ts`             | Add, list (oldest first), delete, and who may delete what                              |
| `social.spec.ts`               | Favorites, following, profiles, and the viewer-specific defects                        |
| `contract-validator.spec.ts`   | The validator itself, no backend: what it must accept and reject                       |
| `spec-gaps.spec.ts`            | What the published spec lacks, pinned; fails when a backend bump improves it           |
| `stubs-match-contract.spec.ts` | The stub layer's own answers against the contract, no backend                          |

## Writing a test

- **Own your data.** Make users and articles with `userFactory` and `articleFactory`, give a list
  test a tag or author nothing else uses and filter by it, and use unique values even for deliberately
  bad input. The backend is shared by every parallel worker, and a fixed address collides with itself
  on the next run.
- **Assert the status, the error body, and the contract.** `expectContract('POST /api/articles', res)`
  takes the operation as the spec declares it. Pass `{ source: 'supplement' }` on a response the
  spec doesn't cover, so the gap is visible in the test.
- **Pin a defect as observed, don't skip it.** Call `knownIssue('what is wrong')`, assert what the
  backend does today, and expect the test to fail on purpose when it is fixed. Date and explain it in
  [docs/findings.md](../../docs/findings.md).
- **`send()`, not the typed methods**, for anything that might not be a 2xx. The typed methods throw
  on a non-2xx, which is right for set-up and wrong for a test.

Tag a spec `@smoke` only if it's the happy path for a feature area. Untagged specs are the
regression tier by default. `@smoke` and `@quarantine` are the only tags, and `npm run check:tags`
fails on anything else, see [ADR-0008](../../docs/adr/0008-test-tiers-and-ci-triggers.md).
