# tests/ui

Functional UI specs against the real, Dockerized backend, one file per feature area
(`auth`, `articles`, `comments`, `favorites`, `home`, `profile`, `settings`). Use the
page-object fixtures from `pages/` — never instantiate a page object with `new` inside a
test.

**Set up data through the API, not the UI.** A comments test shouldn't click through
article creation first: use `userFactory`/`articleFactory`, then drive only the feature
under test. The UI is used for setup only when setup _is_ the flow being tested.

**Every test owns its data.** All parallel workers share one database, so nothing may
assume a fixed user, slug, or an empty feed. Where a test needs a deterministic article
list, give its articles a `buildTag()` tag and open `/tag/<tag>` (`homePage.gotoTag`).

**Pair every "is hidden" assertion with a positive case** that uses the same locator, so
a wrong locator can't make a negative test pass vacuously.

Prefer `getByRole`/`getByLabel`/`getByPlaceholder`; see [`pages/README.md`](../../pages/README.md)
for the locator strategy and the app-specific pitfalls.
