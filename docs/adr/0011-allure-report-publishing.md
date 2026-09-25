# 0011: Publishing the Allure report: Allure 3, history in a branch

- Status: Accepted
- Date: 2026-09-25

## Context

[0004](0004-allure-report-publishing.md) decided to publish the Allure report as a live site
on GitHub Pages, with trend history. Building it turned up several facts that shaped how.

- **Allure 3 is a Node CLI** (`allure`, no JDK); Allure 2 (`allure-commandline`) needs Java. Both
  install a binary named `allure`, so they can't coexist. Trend history in Allure 3 is one
  `history.jsonl` file that the report reads and appends to.
- **Nothing persists between CI runs**, so history has to live somewhere.
- **The generated report reports to Google Analytics.** Allure 3 hardcodes
  `analyticsEnable: true` in the HTML template of every report plugin, with no config or
  environment switch. A public page would send each visitor's URL and browser details to
  Allure's analytics property.
- **`allure generate` doesn't clean its output directory.** Re-running it left the old report
  in place (same report id and timestamp) while still appending to history.
- **The Allure reporter appends to `allure-results/`** rather than replacing it, which is what
  lets the three runs inside `test:full` merge into one report, but means local results pile
  up across runs.
- **Allure marks a test flaky** only if the adapter says so or its recent history alternates.
  `allure-playwright` doesn't flag a test that passed on retry, so a retried test shows as a
  retry, not as flaky.

## Decision

**Allure 3, not Allure 2.** Anyone can build the report with `npm ci`, no JDK. Config is
`allurerc.mjs`: the modern report UI, and a curated chart set (current status, status over
recent runs, tests that changed status, duration over recent runs, stability by project).
The default set groups by feature/epic/story labels our results don't carry.

**History lives in the `gh-pages` branch, next to the report.** Each publish reads
`history.jsonl` from the branch, generates the report (which appends a run), and force-pushes
a single fresh commit containing the report and the updated history. Pages serves that branch.

Not the obvious alternative of reading history back from the deployed site: Pages sits behind
a CDN that caches for minutes, so a run starting just after another deployed could fetch the
previous `history.jsonl` and silently drop that run from the trend. Git reads are consistent.
Two runs on `main` minutes apart is ordinary here.

**The publish logic is a script, `tools/ci/publish-allure-report.mjs`**, so it could be tested
locally against a throwaway git remote. It:

- tells "the branch doesn't exist yet" apart from a real git failure (`ls-remote` exits 0 with
  no output for the former), so a network or auth error can't reset the trend;
- refuses to publish if history did not grow;
- redacts the token from any error, and deliberately attaches no `cause` to rethrown errors,
  because the original message contains the credentialed URL.

**Analytics is stripped and verified absent.** `tools/ci/generate-allure-report.mjs` removes the
two tags from `index.html`, then scans the whole output and fails the build if any analytics
reference remains, so a change to Allure's template can't quietly bring it back. Loading the
published report in a browser made 16 requests, all to its own origin.

**When it runs.** A `report` job publishes after the test job on pushes to `main`, the nightly
run and manual dispatches, **including after failures**, since a red run is the one most worth
reading. Pull requests never publish, so their results don't enter the trend. Publishing is
serialised by a concurrency group (queued, not cancelled) because it reads and writes history.
The report is named for its tier and run number.

**Failures are sorted by cause.** Categories separate a changed visual baseline, a changed
accessibility record, a failed backend call, a missing API stub, an unreachable environment and
a timeout; anything else falls into Allure's built-in "Product errors". Each was checked against
a real failure of that kind, and that check corrected one rule.

## Consequences

**Positive**

- A public, linkable report with trends per test and per project, built with no extra tooling.
- History is durable, inspectable in git, and immune to CDN staleness.
- A visual failure carries Allure's image-diff view plus expected/actual/diff images; a passing
  run stays small (about 3 MB of report data for 12 results including four visual failures).
- The publisher's failure paths were exercised: unreachable remote, credential redaction,
  missing results, and a strip that no longer matches.

**Negative**

- **We patch generated HTML.** The strip depends on Allure's template; when that changes the
  guard fails the build, which is the intended behaviour but is a maintenance event.
- **`gh-pages` is force-pushed.** The report has no per-run archive; only the latest report and
  the accumulated history survive.
- **Flake rate is not tracked by this.** "Flaky" here means history-based alternation, not
  retry-based, so a test that passes on retry appears under the report's Retry filter, not as
  flaky. The dedicated retry-with-reporting work still has to do that.
- **Local results accumulate.** Run `npm run clean:results` before a run you intend to report on,
  or the report contains everything since you last cleaned. Local runs write no history: it's
  opt-in through `ALLURE_HISTORY_PATH`, set only by the publish job.
- **The trend is only as long as the retained history** (`historyLimit: 60` runs, roughly
  4 MB), and mixes tiers: a smoke run and a full run have different test sets. Trends are per
  test, so this is sound, but the aggregate charts wobble with the tier.
- Traces and videos of failing tests are published, and contain only synthetic data from a
  public demo app.

## Alternatives considered

- **Allure 2 (Java)** — rejected: needs a JDK for every reviewer who wants to build a report, and
  its history is a folder to be carried between runs.
- **History from the deployed site** — rejected, on the CDN-staleness hazard above.
- **A hosted Allure service (TestOps)** — out of scope, and it would move the report off a page
  we control.
- **Only uploading the report as a CI artifact** — kept as a supplement, not the delivery:
  ADR-0004's reason for publishing was that reviewers shouldn't need repo access.
- **A third-party "publish Allure" action** — rejected: it would hide the history and analytics
  behaviour this ADR exists to control, and add a supply-chain dependency.
