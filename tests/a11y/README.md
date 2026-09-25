# tests/a11y

Accessibility scans with `@axe-core/playwright` (WCAG 2.0/2.1 A and AA) over the same
scenes as the visual suite, using the same page objects.

The app has known defects we can't fix, so this is a **ratchet**, not a zero-violations
gate: each scene's violations are recorded in `known-violations/<scene>.txt`, and any
difference fails. A new violation is a regression; one that has gone means the record is
stale. Design and evidence: [ADR-0010](../../docs/adr/0010-a11y-as-a-ratchet-on-recorded-violations.md).

```bash
npm run test:a11y          # compare against the records
npm run test:a11y:update   # rewrite them — then review the diff
```

Reading a failure: the diff shows `rule (impact) xCount` lines. The full axe result
(selectors, colours, help links) is attached to the test in the HTML report.

Updating the records makes accepting a regression as easy as accepting a fix, so treat the
diff as code review: a lower count or a removed line is good news, anything else needs a
reason.

What this does not cover: keyboard navigation, focus order, announcements, and any state
that needs interaction. Placeholder-only form fields also pass, because axe accepts a
placeholder as an accessible name.
