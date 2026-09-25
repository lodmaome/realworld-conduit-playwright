# tests/support

Shared by the visual and a11y suites — the pieces that make a page render the same way
every time.

- `api-mock.ts` — replaces the network for one page: the API is answered from typed stubs,
  the app's own origin passes through, everything else is blocked (the frontend's Google
  Fonts and Ionicons links). An API request with no stub fails the test.
- `sample-data.ts` — the fixed users, articles, comments and tags. Fixed on purpose: no
  clock, no database, no other test's data.
- `scenes.ts` — the ten pages-in-a-state that both suites iterate over, so the two can't
  drift apart on coverage. Add a page here once and both suites pick it up.

- `quarantine.ts` — `quarantined(until, reason)`, the options that mark a test as quarantined.
  The reason and expiry live on the test; `npm run check:tags` fails once the date passes
  ([ADR-0012](../../docs/adr/0012-flake-handling.md)).

Call `mockApi(...)` before the first navigation; the routes must exist before the page loads.
