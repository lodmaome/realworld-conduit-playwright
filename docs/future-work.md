# Future work

What was left out on purpose, and what would come next. This is not the list of known limitations (that
is the end of the [test strategy](test-strategy.md)); it is what could be built, why it wasn't, and where it
would plug in. Effort estimates are judgement, not measurements: small is under a day, medium is a few days.

## Left out on purpose

The two items the original brief excluded from v1, written up so the reasoning survives.

### Mutation testing

**What it would tell you:** whether the tests fail when the code is broken, which a passing suite
can't say for itself.

**Why not the whole suite.** The code under test is an upstream backend and frontend this repository
doesn't own, pinned to commits ([0002](adr/0002-pin-upstream-app-versions.md)). Mutating them means
building each from source with a mutator (Stryker.NET for the backend, StrykerJS for the frontend) and
running the suite against every mutant. Each mutant needs a rebuilt Docker stack, and a suite of a few
hundred browser and API tests takes minutes, so a realistic mutant count is hours per run for a signal
that is mostly about upstream code.

**What exists instead.** The practice, done by hand: every test that asserts something did _not_
happen was checked by making the failure disappear and confirming the test failed, and the results,
including the mutations that were invalid, are recorded in
[0013](adr/0013-api-overrides-for-the-mocked-ui-project.md),
[0014](adr/0014-pr-coverage-gap-flagger.md) and
[0015](adr/0015-validate-responses-against-the-contract.md). It is unautomated and only as thorough as
the person doing it.

**What to do first if this is picked up (small to medium).** Run StrykerJS over the code this
repository does own and unit-tests: `tools/` (152 tests under `npm run test:tools`, seconds per mutant).
Nightly or on demand, not per pull request, reporting a score per module. Leave the end-to-end suites
out: their cost per mutant is the reason above, and a low score there would mostly point at the pinned
apps.

### Security scanning

**What this repository is and isn't.** It tests a demo application it doesn't own. The security-relevant
behaviour it does cover is functional: authorisation boundaries (`403` on someone else's article or
comment), no account enumeration on sign-in, token handling, and that markup in an article is rendered
inert. [The findings page](findings.md) says in its first lines that it is not a security review, and
that stays true.

**Where it stands today.** `npm audit` reports 0 vulnerabilities (run by hand on 2026-09-25; it is not
run in CI). There is no dependency-update automation. The two Dockerfiles owned here
(`docker/frontend`, `docker/playwright`) are not scanned. The app pins are deliberately manual
([0002](adr/0002-pin-upstream-app-versions.md)), so an upstream security fix needs a reviewed bump.

**Candidates, cheapest first.**

1. **`npm audit` in the static job, and Dependabot or Renovate for npm and GitHub Actions only**
   (small). Not for the app pins: a bump there must be reviewed for API and DOM changes.
2. **GitHub secret scanning and push protection** (small; a repository setting).
3. **An image scan (Trivy or Grype) of the two Dockerfiles** (small). The frontend image is built from
   upstream source, so most findings would be upstream's; useful mainly for the pinned Playwright image.
4. **A passive ZAP baseline against the running stack** (medium). A demo app without hardening will
   produce findings, so it would need the same treatment as accessibility: record what is known and fail
   on anything new, a ratchet ([0010](adr/0010-a11y-as-a-ratchet-on-recorded-violations.md)), or it
   becomes noise that gets ignored.

## Next candidates

Grounded in what is open now, most useful first. None is required for the v1 scope.

1. **A pin-drift check** (small). [0002](adr/0002-pin-upstream-app-versions.md) says the pins need a
   periodic look, and today that is only a note in the [runbook](maintenance.md). A scheduled workflow
   could compare each pinned SHA with the upstream tip and open an issue when they differ, so a pin
   can't become accidentally permanent. It should not bump anything; that stays a reviewed change.
2. **Cross-browser smoke** (medium). Everything runs on Chromium, and the icon-glyph behaviour behind
   `iconLabel()` was verified only there, so Firefox and WebKit mean re-checking it. A nightly smoke
   pass on both would close the gap without slowing pull requests. The hands-on
   [playwright-qa-portfolio](https://github.com/lodmaome/playwright-qa-portfolio) already covers
   cross-browser, which is why this was left out.
3. **Keyboard, focus-order and screen-reader checks** (medium). The accessibility suite is the
   machine-checkable subset (axe); the [strategy](test-strategy.md) says so. Keyboard navigation of the
   main flows is testable with Playwright and is what axe can't see.
4. **Contract fuzzing** (medium), once the published spec declares its error responses. A schema-driven
   tool (Schemathesis) tests the spec, and this spec is incomplete
   ([0015](adr/0015-validate-responses-against-the-contract.md)); today the hand-written cases and the
   pinned defects carry the value.
5. **A gate on the coverage-gap report** (small). It reports and doesn't block
   ([0014](adr/0014-pr-coverage-gap-flagger.md)). If gaps start being ignored, `--fail-on-gap` exists,
   and a pull-request comment would be more visible than a job summary.
6. **Watch the upstream issues** (small, recurring). Four defects were reported upstream
   (`realworld-apps/aspnetcore-realworld-example-app` #141 to #144). When one is fixed, bump the pin and
   rewrite its `known-issue` test to assert the fix, as the [runbook](maintenance.md) describes.

## Verification still owed

Three flake-tooling paths were not seen live ([0012](adr/0012-flake-handling.md), amendment): how the
job-summary block renders in the Actions UI (needs a signed-in look at one run page), the
release-candidate state (needs seven nightly passes), and what the budget does with a real, unplanned
flake. They need time and a person looking, not code.
