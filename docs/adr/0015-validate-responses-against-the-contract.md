# 0015: Validate real responses against the OpenAPI contract, and supplement what it leaves out

- Status: Accepted
- Date: 2026-09-25

## Context

The API suite was one test. Every endpoint showed as "reached" in the coverage-gap report
([0014](0014-pr-coverage-gap-flagger.md)), but nearly always through the browser or as data set-up,
so nothing verified the REST contract directly: status codes, validation, who may do what.

The contract was only checked at compile time. `schema.d.ts` is generated from the backend's OpenAPI
spec, but a type can't tell you a response drifted from it, and the stubs the visual, a11y and
mocked-UI suites run on ([0013](0013-api-overrides-for-the-mocked-ui-project.md)) were typed from it
without ever being compared to what the backend sends.

Reading the spec closely, and then probing the backend, showed the published contract is much thinner
than the backend's behaviour (all measured 2026-09-25 against the pinned backend):

- **Every operation declares only a `200` response.** The backend also sends `201`, `204`, `401`,
  `403`, `404`, `409` and `422`. None of those is in the spec.
- **Five operations declare no response body at all** (create user, article and comment; delete
  article and comment), though the creates return a body and the deletes answer `204`.
- **No schema declares a `required` property.** Every field is optional, so a response missing
  `token` satisfies the spec. (`additionalProperties: false` is declared on every schema, so extra
  fields are caught; missing ones are not.)
- **The backend's own error shape is not uniform:** every `4xx` is `{ errors: { field: [messages] } }`,
  but an unhandled failure is `{ errors: "InternalServerError" }`, a string.

## Decision

**Commit the spec as `api-client/openapi.json`, and generate `schema.d.ts` from that file**, not from
the URL, via `npm run generate:api-types` (`tools/ci/generate-api-types.mjs`). One source, two
committed artefacts. Regenerating leaves `schema.d.ts` byte-identical to the previous URL-based
generation, so nothing existing moved, and `tools/ci/api-types.test.mjs` fails if a pull request
updates one file and not the other (it was checked by editing the JSON and watching it fail).

**Validate real responses at run time with `ajv` 8** (`api-client/contract.ts`). Version 8 because
version 6, which ESLint already pulls in, doesn't understand OpenAPI's `nullable`. The spec uses two
formats, `int32` and `date-time`; they are implemented in six lines instead of adding `ajv-formats`,
a package whose last release was March 2024, for two checks.

**Two sources of truth, and every check says which it used.**
`openapi` is a schema the spec declares. `supplement` is a schema we wrote for something the spec is
silent on, from observing the backend: the `201` bodies, the empty `204`, and the `4xx` error
envelope. Presence rules (`observedPresence`) add `required` lists for the keys the backend was
observed to always send. `body` is deliberately left off Article because list items omit it. A
supplement is our assertion about the backend, not the published contract, and the tests can pin
which one a response was checked against (`expectContract(op, res, { source })`).

**A response nothing describes is an error, not a pass.** An unknown operation or a status with no
schema and no supplement throws, so a new status is a decision, not something ignored.

**The supplements can't outlive their reason.** `tests/api/spec-gaps.spec.ts` reads the committed
spec and pins what it lacks (only `200`, five bodyless operations, no `required`). When a backend bump
improves the spec, those tests fail and name the supplement to delete, and a further test fails if any
supplement is redundant.

**The stub layer is checked against the contract, offline.** `tests/api/stubs-match-contract.spec.ts`
calls the stub layer's own `stubFor` and validates every answer it can give. It found two real drifts
on its first run, both fixed: every stub article omitted the `comments` array the backend always
sends, and the `GET /user` `401` stub answered `{}` where the backend sends
`{"errors":{"token":["is missing"]}}` (the drift recorded in ADR-0013).

**The API suite** (`tests/api/`, 111 tests) covers each resource: registration, sign-in, token
handling, account updates, the article lifecycle, listing, filtering and pagination, the feed,
comments, favorites, following and profiles. Each success and failure status is asserted, with the
exact error body, and each response is checked against the contract. Every test owns its data
(unique users, tags and authors, and lists filtered by them), so the shared database and parallel
workers can't change an answer. `apiClient.send()` returns the status and body without throwing,
because the typed methods that throw on a non-2xx are right for set-up and wrong for testing an error.
`expectContract` is registered with `playwright/expect-expect`, so a contract check counts as an
assertion.

**Backend defects are pinned as observed and labelled `known-issue`**, the same convention as
[0013](0013-api-overrides-for-the-mocked-ui-project.md): the test asserts what the backend does today
and fails on purpose when it is fixed. They are listed in `docs/findings.md`.

## Evidence

- **Probing came before writing.** Three scripts drove the real backend across every resource and
  printed status and body; the tests were written from those, not from the spec or from assumption.
- **The contract check bites on real responses.** Making the validator demand a field the backend
  never sends (`invented` on a person) failed 19 real tests, each with a message such as
  `/article/author must have required property 'invented'`; restoring it returned all 111 to green.
- **The suite is repeatable and isolated.** Three consecutive full-parallel runs of the API project
  passed all 111 each time, and each spec file was also run twice on its own.
- The validator has 14 tests of its own, run without a backend first: it accepts a declared response,
  and rejects an extra property, a wrong type, a missing observed key, a malformed date-time, an
  `int32` fraction and overflow, a bodyful `204`, and a `4xx` that isn't the error envelope.

Mistakes found along the way, kept because each is easy to make again:

- **A probe blamed the wrong cause.** Article creation returned a `500` and I concluded that
  duplicate tags were to blame. Narrowing it showed duplicate tags do cause a `500`, but the failure
  in that probe was a different defect: I had renamed the user and kept using the pre-rename token,
  which the backend answers with `404` on `/user` and `500` on writes. Both are now pinned, each with
  its own test.
- **Probes invalidated by their own steps** twice: one renamed an article (a title change changes
  the slug) before using the old slug; another reused a name. Each was rerun from a clean position
  before anything was written from it.
- **A deliberately bad email must still be unique.** Two known-defect tests used a fixed malformed
  address, my earlier probes had already registered it, and the backend correctly answered `409`. Fixed
  by generating the bad address per test.
- **Prettier had reformatted the generated JSON**, so regenerating produced a diff every time. It is
  now in `.prettierignore`, and regeneration was checked to be byte-stable.

## Consequences

**Positive**

- The REST contract is verified directly, including the error paths and authorisation boundaries the
  UI suite can't reach, and the API layer now has its own evidence.
- A backend bump that adds, removes or retypes a field fails a named test at the operation that
  changed, instead of surfacing later in a UI test.
- The three stub-based suites can no longer drift from the backend without a test noticing.
- The published spec's gaps are documented and pinned, and retire themselves when fixed.

**Negative**

- **Supplements and presence rules are our assertions**, from observing one backend commit, not the
  vendor's contract. They can be wrong, and they are labelled so.
- **Strict schemas mean a harmless new field fails tests.** That is the intent (it is a contract
  change), and it costs a small update on every backend bump that adds one.
- **Tests are coupled to error wording** (`can't be blank`, `has already been taken`) and status
  codes, so a backend that rewords a message will fail them.
- **The pinned defects need rewriting when fixed.** Each one carries the date it was observed.
- **The recorder can't tell set-up from subject**, so this suite's set-up calls still count as
  "reached" in the coverage-gap report ([0014](0014-pr-coverage-gap-flagger.md)).
- **Request bodies aren't validated**, only responses.

## Alternatives considered

- **Hand-written schemas (zod or similar):** rejected. It is a second copy of the contract that
  drifts, which is what generating types from the spec avoided.
- **A response-validation library built for OpenAPI:** rejected. It would validate the spec exactly
  as published, gaps included, and there would still be nowhere to put the supplements.
- **Schema-driven fuzzing or contract tools (Schemathesis, Dredd, Pact):** rejected for v1. They test
  the spec, and this spec is incomplete; the value here is in the hand-written cases and the pinned
  defects. Worth revisiting once the spec declares its errors.
- **`ajv-formats`:** rejected for two formats, as above.
- **Validating in the typed client itself:** rejected. The typed methods are set-up helpers, and
  validating there would fail set-up for the wrong reason.
