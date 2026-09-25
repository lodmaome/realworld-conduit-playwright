# 0014: A PR coverage-gap flagger built on the API contract and recorded traffic

- Status: Accepted
- Date: 2026-09-25

## Context

The plan was a tool that takes a pull request and flags changed endpoints no test reaches. Three
things about this repository decide what that can mean:

- **We don't own the application.** Backend and frontend are pinned upstream commits
  ([0002](0002-pin-upstream-app-versions.md)). A pull request here never edits an endpoint
  handler, so "the changed lines" are not endpoint code. The event that changes what the backend
  does is bumping its pin, and the only place that change becomes visible to this repository is
  `api-client/schema.d.ts`, the OpenAPI-derived types the maintenance runbook already says to
  regenerate and review after a bump.
- **The tests that matter reach the backend in two ways.** The browser (the `ui` suite) and the
  `apiClient` fixture (the `api` suite and every test's data set-up). A third group, `ui-mocked`,
  sends its requests to stubs and says nothing about the backend.
- **The pull-request tier is smoke only** ([0008](0008-test-tiers-and-ci-triggers.md)), ten tests.
  Judged against smoke alone, nearly every endpoint would look uncovered.

## Decision

**A changed endpoint is an operation in the schema that was added, or whose contract changed
between the pull request's base and its head.** The schema is parsed with the TypeScript compiler
rather than regular expressions, because it is a nested type. An operation's fingerprint covers its
own definition and every schema it refers to, however deeply, so altering `Comment` changes the
endpoints that return an `Article`, which contains comments, even though their own text is
untouched. Comments and whitespace are ignored: a reworded description is not a contract change.
Removed operations are listed but not treated as gaps.

**Covered means reached by at least one passing real-backend test**, from recorded traffic, not from
annotations. `tests/support/endpoint-hits.ts` records each API request a test sends, from the
browser context and from the `apiClient`, into one file per test attempt. It is off unless
`RECORD_ENDPOINT_HITS` names a directory, so ordinary runs are unchanged. Only passing attempts
count (a test that failed early may never have reached what it was written for, and a retry that
passed counts once). `api` and `ui` are real; `ui-mocked` is recorded too, so an endpoint reached
**only by stubs** is reported as a weaker state, not as covered and not as untouched. Concrete
paths are matched back to their templates, and the literal path wins over a parameter
(`/articles/feed` over `/articles/{slug}`).

**The report never gives a silent answer.** It stops with an error, rather than reporting, when
there are no recorded hits, no passing real-backend test in them, or the base cannot be read. It
lists requests that matched no declared endpoint (a stale schema). And it warns when the backend
pin moved but `schema.d.ts` did not, because that looks exactly like "nothing changed" and is the
one answer the tool must not give quietly.

**It reports; it does not block.** `--fail-on-gap` exists and is off. A gap is a prompt to write or
justify a test, and a hard gate on "reached" would push people toward tests that call an endpoint
without checking it (see Consequences).

**CI runs it only on pull requests that touch `api-client/schema.d.ts` or the compose file.**
Recording re-runs `api`, `ui` and `ui-mocked` (about a minute of tests plus start-up), so other
pull requests skip it. `npm run coverage:record` then `npm run coverage-gap -- --base <ref>` (or
`--all`) reproduce it locally.

**It does not select tests.** [0008](0008-test-tiers-and-ci-triggers.md) rejected selecting tests
by changed paths "for now", pointing at this tool. This tool reports gaps; it doesn't choose what
to run, so that alternative is still rejected and still unbuilt.

## Evidence

Measured on 2026-09-25 against the running stack:

- The recorder wrote a file for every test: 81 (`api` 1, `ui` 37, `ui-mocked` 43), all `passed`,
  and the single `api` test's file held exactly the two calls that test makes.
- The whole-suite report found 19 of 19 declared endpoints reached by a real-backend test. The
  counts were plausible (`POST /api/users` reached by 33 tests, because the auth fixtures create a
  user per test).
- A simulated pull request (a new `GET /api/articles/{slug}/related`, and an extra field on
  `Comment`) was reported as 1 added and 7 changed. The new endpoint was flagged with a warning
  annotation and exit code 1 under `--fail-on-gap`; the seven changed ones were covered. The seven
  were checked against the schema text: `Comment` is referenced by `Article` and by
  `CommentsEnvelope`, and `POST`/`DELETE` on comments return no typed body, so they were rightly
  not flagged.
- A simulated backend pin bump with no schema change produced the warning and "No endpoint in the
  API contract changed", not a bare "nothing changed". Both simulations were restored afterwards.
- 44 unit tests cover the parser (including a three-level schema chain and a self-referencing
  schema), the matcher, the differ, the pin reader, the analysis (failed attempts, retries, stubs,
  unmatched requests) and the report.

Two mistakes were found while building it. The differ sorted with `localeCompare`, which depends on
the machine's locale, so the same report could list its rows in a different order on a laptop and
in CI; it now compares code units. And a test meant to show removed endpoints used a schema that
removed none, so it failed for a reason in the test, not the tool.

## Consequences

**Positive**

- A pull request that changes the contract gets a table of exactly which changed endpoints no test
  reaches, in the job summary, with annotations on the pull request.
- The whole-suite mode is a plain answer to "what does this suite touch", with no annotation to
  maintain and none to forget.
- The pin-without-schema warning closes the gap in the bump procedure that would otherwise make the
  tool blind.

**Negative**

- **"Reached" is not "verified".** A test that only registers a user as set-up reaches
  `POST /api/users` without asserting anything about it. The recording can't tell set-up from
  subject: the same `apiClient` call serves both. The report says so and shows how each endpoint
  was reached (`browser` or `apiClient`), which is a hint, not a distinction. A gate on this number
  would reward the wrong thing, which is why it doesn't gate.
- **It sees only what the schema shows.** A backend behaviour change that leaves the OpenAPI
  contract alone (a validation rule, a status code the schema doesn't list) is invisible. So is any
  frontend change; a frontend pin bump is ignored on purpose, since it can't change the API.
- **The schema has to be regenerated by a person.** The warning catches a bump without it, not a
  regeneration against the wrong backend.
- **It costs a recording run** on the pull requests that need it, and adds a fixture to `base.ts`
  that wraps the API request context when recording, a small piece of test infrastructure the
  suite now carries.
- **Not yet run on a real pull request.** The tool, the recorder, the workflow's syntax and its
  change-detection command were each verified, but the CI job itself only runs on a pull request
  and has not been exercised on one.

## Alternatives considered

- **Code coverage of the backend or frontend** (instrumentation, Istanbul, dotnet-coverage):
  rejected. We don't build either from source in a way we control, and line coverage says nothing
  about which endpoints a suite exercises.
- **Annotating each test with the endpoints it covers** (a `@covers` tag or annotation): rejected.
  It is the version that goes stale, and the recorder gets the same answer from real traffic with
  nothing to maintain.
- **Diffing the running backend's Swagger instead of the committed schema:** rejected for the pull
  request path. It needs the base version of the backend running as well, and the committed schema
  is already the reviewed record of the contract.
- **Counting `ui-mocked` as coverage:** rejected. A stub answered that request; the backend never
  saw it.
- **Failing the build on a gap:** rejected for now, for the reason under Consequences. Revisit if
  gaps are being ignored.
- **A path filter action for the trigger:** rejected in favour of one `git diff` in the workflow,
  which is one fewer third-party action.
