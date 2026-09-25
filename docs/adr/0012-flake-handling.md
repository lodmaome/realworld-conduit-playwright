# 0012: Flake handling: retry with reporting, a flake budget, accountable quarantine

- Status: Accepted
- Date: 2026-09-25

## Context

CI retries a failed test once (`retries: 1`) so a single environmental hiccup doesn't block a
merge. That was always described as a stopgap, because a bare retry is invisible: a test that
fails and then passes turns the run green, and nothing records that it happened. A test can get
steadily less reliable and the only symptom is that CI feels slower to trust.

What Playwright and Allure give us, checked rather than assumed:

- Playwright already labels a test whose retry passed as `flaky` (`test.outcome()`), and keeps
  every attempt with its errors. The information exists; nothing was keeping it.
- Allure 3 marks a test flaky only if the adapter says so or its recent history alternates, and
  `allure-playwright` doesn't flag a retried-then-passed test ([0011](0011-allure-report-publishing.md)).
  Allure therefore shows a retry but cannot give a flake rate over time.
- The `@quarantine` tag existed ([0008](0008-test-tiers-and-ci-triggers.md)), but nothing forced a
  quarantined test to say why, or to ever leave.

The goal is retry **with reporting**, not blind retries: keep the retry's benefit, remove its
invisibility, and put a limit on how much unreliability the retry is allowed to absorb.

## Decision

**Record every retry.** `tools/flake-report/reporter.mjs` is a Playwright reporter that writes one
JSON file per invocation into `flake-results/`: each test's outcome (`passed`, `failed`, `flaky`,
`skipped`), its attempts, and the first line of each failed attempt's error. `test:full` makes
three invocations plus the quarantine step, and the publish step merges them into one run.

**Show it in the run that caused it.** A job-summary block and one `::warning` annotation per
flaky test ("these are the tests the retry papered over"). This reports only and never fails the
job.

**Keep the rate over time.** The publish step reads `flake-history.jsonl` from the `gh-pages`
branch (the same place, and for the same CDN-staleness reason, as Allure's history), appends this
run, and renders a self-contained dashboard at `/flakes/`: a bar per run, the tests that flaked,
and the quarantine list. Each history entry is about 6 KB for the real suite; 90 runs is about
half a megabyte. The dashboard makes no external requests, runs no scripts, escapes everything
that came from a test run. It was checked with axe by hand in four states (no history, all clean, over budget, an expired quarantine that is also a release candidate) and both colour schemes; the first pass found a light-mode contrast failure in the "all clean" state, which is now fixed, so it was checked in more than the one state that looked worst.

**A flake budget.** A test that is not quarantined and has flaked **3 times in its own last 10
runs** fails the run, after the report is published so the dashboard is there to explain it. One
flake is noise, which is what the retry is for; three in ten means the test is unreliable and
the retry has stopped being a safety net and become a habit. Two is shown as "watch".

The window is the test's own last 10 _observations_, not the last 10 runs of `main`. An earlier
version counted runs and had a flaw found by reasoning about it: the visual and a11y suites run
only in the nightly tier, so they appear about once every three runs and could never reach three
flakes inside ten runs. A regression test pins this (the run-based window sees 2 flakes and no
violation; the per-test window sees 3 and flags it).

**Quarantine that has to explain itself and eventually end.** A quarantined test carries the
`@quarantine` tag and an annotation `until YYYY-MM-DD: reason`, written with
`quarantined(until, reason)` from `tests/support/quarantine.ts`. `npm run check:tags` fails on a
missing reason or expiry, a malformed or impossible date, an annotation without the tag, and on a
quarantine whose date has passed. Quarantined tests still run every night, non-blocking, and
their outcomes are recorded apart from the totals: a quarantined test with 7 passing nights in a
row is shown as a candidate for release.

**A quarantined test is exempt from the budget, by what the code says today.** Its old flakes stay
in history, so without this a fix that quarantines a flaky test would keep failing `main` until
ten more runs aged them out. The exemption uses the list of currently quarantined tests from
`playwright test --list`, which relies on the reporter and the list producing identical test ids
(checked end to end, below).

**No auto-quarantine.** The dashboard proposes; a person decides. A test that starts failing
intermittently because of a real regression is exactly what an automatic quarantine would hide.

## Evidence

- The reporter was run under real Playwright with every outcome present (pass, fail, flaky,
  skipped, quarantined) and recorded each correctly, including the failed attempt's error and the
  parsed quarantine metadata. It also loads and writes from inside the pinned image.
- The full pipeline was run locally against a throwaway git remote with a deliberately flaky
  test: history grew 1, 2, 3; the budget check failed at the third flake; after quarantining the
  test in code the same check passed (so the ids match); and a publish with no flake results
  carried the dashboard and history forward instead of losing them.
- `check:tags` was run against real Playwright output for a valid, an expired, a malformed and an
  untagged quarantine.
- 76 unit tests cover the aggregation, thresholds, id normalisation across Windows and Linux,
  expiry boundaries, an impossible date (`2026-02-31` would otherwise roll into March),
  corrupt-history handling, HTML escaping, and annotation injection.

Not verified: none of this has run on GitHub Actions yet, so the job summary and annotations have
not been seen rendered, and no real flake has occurred, so the live dashboard will honestly say
"no flakes" until one does.

## Consequences

**Positive**

- A retry that rescued a run is visible in that run and in the trend, instead of invisible.
- Unreliability has a limit, and hitting it forces a decision: fix, or quarantine with a reason and
  an end date.
- Quarantine can't become permanent by neglect: it expires loudly, and release is prompted by data.
- Retries stay cheap and merges aren't blocked by a single environmental blip.

**Negative**

- **The budget only sees runs of `main`.** Pull-request runs don't enter history, so a flake that
  only ever happens on a PR is shown in that run's summary but never counted.
- **Renaming a test resets its history**, because the id includes its title.
- **An expired quarantine fails the static job for everyone**, including unrelated pull requests,
  from the day after it lapses. That pressure is the point; extending one is a reviewed change to
  the date.
- **Flakes are still merged.** The budget bites at the third, not the first. Retries mean a flaky
  test passes CI; this makes that visible and bounded, not impossible.
- History is plain JSON Lines with no migration story; a change to the entry shape needs one.
- The dashboard is generated at publish time, so it is as fresh as the last run on `main`.

## Alternatives considered

- **Playwright's `failOnFlakyTests`** — rejected as too blunt: every single flake turns the run
  red, so people re-run until green, which hides the flake instead of recording it, and it gives
  no trend.
- **No retries** — rejected: environmental blips would block merges, and "re-run until it passes"
  is a blind retry done by hand, with no record.
- **Automatic quarantine** — rejected, above.
- **Quarantine as a tag alone, or a separate manifest file** — rejected: a tag has no reason or
  expiry, and a manifest can drift from the code it describes.
- **Allure's flaky detection** — insufficient, as in Context: not retry-based, and no rate over time.
- **A hosted flake-tracking service** — out of scope for a self-contained repository, and it would
  move the data off a page we control.
