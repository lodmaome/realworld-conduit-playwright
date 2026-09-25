# tests/a11y

Accessibility specs using `@axe-core/playwright`. Reuse the same page objects as
`tests/ui/`, asserting on `AxeBuilder(...).analyze()` violations instead of
functional state.

Known finding to assert on first: the app's form fields have no `<label>`s (only
placeholders) — see [ADR-0007](../../docs/adr/0007-fixture-composed-page-objects.md).
