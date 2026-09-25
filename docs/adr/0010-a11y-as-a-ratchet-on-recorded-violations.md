# 0010: Accessibility as a ratchet on recorded violations

- Status: Accepted
- Date: 2026-09-25

## Context

The a11y suite scans pages with axe-core, but the application under test has accessibility
defects that we cannot fix, because we don't own its markup ([0005](0005-frontend-custom-docker-build.md)).
A scan of the ten scenes found the same four rules on nearly every page:

| Rule             | Impact   | What it is in this app                                                                                                      |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `color-contrast` | serious  | Theme greys (`#999`–`#d6d6d6`) on white at 1.45–2.84:1, and the brand green `#33aa44` at 3.01:1, against the 4.5:1 required |
| `html-has-lang`  | serious  | `<html>` has no `lang` attribute                                                                                            |
| `image-alt`      | critical | Avatar `<img>` elements have no `alt`                                                                                       |
| `link-name`      | serious  | Links whose only content is an avatar image have no accessible name                                                         |

The two obvious policies both fail. A "zero violations" gate is permanently red. Switching
off the failing rules turns the suite green while hiding the defects, and hides any new
violation of the same rule.

## Decision

**The suite is a ratchet.** Each scene's violations are recorded in
`tests/a11y/known-violations/<scene>.txt` as `rule (impact) xCount`, and the test fails on
any difference from that record:

- a **new** rule, or a higher count, is a regression;
- a rule that **disappeared**, or a lower count, means the record is stale and must be
  updated, so it can't quietly rot into a list of things that are no longer true.

The scan uses axe-core's WCAG 2.0 and 2.1 A and AA tags, on the same scenes as the visual
suite. The full axe result (selectors, help links) is attached to each test in the report
for whoever has to triage a failure. `npm run test:a11y:update` rewrites the records; the
resulting diff is reviewed like any other change.

**Transitions are frozen before scanning.** Colour contrast is judged on computed colours,
and the theme fades link colours with CSS transitions. The first records were unstable —
the `register` page reported 2 contrast failures in one run and 5 in another — because
axe measured mid-fade. After injecting `transition: none; animation: none`, eight repeats of
all ten scenes (80 runs) matched the records.

**It runs on the runner, not in the pinned image.** Unlike screenshots, axe results don't
depend on font rendering. That was checked, not assumed: records generated on Windows
matched a run inside the pinned Linux image exactly, so the suite can use the runner's
Chromium and stay quick to run locally.

## Consequences

**Positive**

- Existing defects are documented in version control, and any new violation, or any fix, is
  visible as a diff.
- Counts make the ratchet catch "one more offending element" as well as "a new rule".
- Both directions were exercised: removing a recorded line failed as a new violation, and
  adding a fake one failed as a stale record.

**Negative**

- **The record can be rubber-stamped.** `--update-snapshots` makes accepting a regression as
  easy as accepting a fix; the protection is review, not tooling.
- Counts tie the record to the scenes' markup. A legitimate content change to a scene
  changes a count and needs a deliberate update. If count instability ever returns, fall
  back to recording rules only.
- Automated scanning covers only the machine-checkable subset of accessibility. It does not
  test keyboard navigation, focus order, error-message announcement or screen-reader output,
  and the scenes are static states rather than interactions.
- **Placeholder-only form fields are not flagged.** Axe accepts a placeholder as an
  accessible name, so the login and register pages report no `label` violation even though
  the fields have no labels. That remains a manual finding.

## Alternatives considered

- **A zero-violation gate** — rejected: permanently failing on defects we can't fix.
- **Disabling the failing rules** — rejected: hides the defects and any new violation of the
  same rule.
- **Failing only on `critical` impact** — rejected: the serious violations here, contrast
  and link names, are exactly the ones worth guarding.
- **Recording rule names without counts** — kept as the fallback. Counts were unstable only
  until transitions were frozen, and they catch more, so they stay for now.
- **Scanning against the real backend** — rejected for the same reasons as in
  [0009](0009-visual-regression-in-a-pinned-image.md): the data varies, and axe results
  depend on the page's content.
