# tests/fixtures

The one shared base fixture file (`base.ts`) every suite type (`api`, `ui`,
`ui-mocked`, `visual`, `a11y`) extends: `apiClient`, `userFactory`,
`authenticatedUser`, `authenticatedPage`. Page objects, factories, and the typed API
client are composed together here, not duplicated per test file.

Import `test`/`expect` from this file in every spec — never from `@playwright/test`
directly, or the shared fixtures won't be available.

`authenticatedPage` seeds the JWT the frontend reads from `localStorage` before its
first navigation (see `JwtService` in the frontend source) rather than driving the
UI login form — verified against the actual frontend source, not assumed.

`mockApi(config)` stubs the API and blocks external assets for a page (see [`tests/support`](../support/README.md)); it must be called before the first navigation, and a request with no stub fails the test at teardown. `pages` bundles the page objects into one fixture, because Playwright can't rest-destructure fixtures and the shared scenes drive several pages.
