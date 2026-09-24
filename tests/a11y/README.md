# tests/a11y

Accessibility specs using `@axe-core/playwright`. Reuse the same page objects as
`tests/ui/`, asserting on `AxeBuilder(...).analyze()` violations instead of
functional state.
