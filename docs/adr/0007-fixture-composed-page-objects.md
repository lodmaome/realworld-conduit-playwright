# 0007: Fixture-composed page objects and locator strategy

- Status: Accepted
- Date: 2026-09-24

## Context

Every suite type (`ui`, `ui-mocked`, `visual`, `a11y`) drives the same application
pages, so how a test talks to a page is the most widely shared design decision in the
project. Two constraints shaped it:

1. **We can't change the app's markup.** The frontend is built from upstream source
   ([0005](0005-frontend-custom-docker-build.md)), so we can't add `data-testid`
   attributes. Locators have to work with what the DOM already offers.
2. **Tests run fully parallel against one shared database**
   ([0006](0006-backend-database-provider.md)), so anything a page object holds must be
   per-test, never shared between workers.

Auditing the pinned frontend's real markup, and then running specs against it, turned up
facts that constrain any locator strategy:

- Form fields have no `<label>`s; placeholders are the only accessible hook.
- Buttons that pair an icon font with text (`<i class="ion-heart"></i> Favorite Article`)
  get a CSS-generated glyph folded into their accessible name by Chromium
  (`"<glyph> Favorite Article (0)"`), so `exact: true` and `^`-anchored name matches can
  never succeed, while a plain substring match makes `Follow bob` also match `Unfollow bob`.
- The article page renders its edit/delete/follow/favorite buttons twice (banner and
  footer), which trips Playwright's strict mode on any unscoped locator.
- The loading and empty states of the article list reuse the `.article-preview` class of
  a real preview.
- Two controls (delete comment, remove tag) are bare `<i>` icons with click handlers —
  no role or accessible name exists for them.

## Decision

**Pattern: page objects exposed as Playwright fixtures.** Each page is a small class
taking a `Page`, registered as a fixture in `tests/fixtures/base.ts` so a test
destructures `{ articlePage }` instead of constructing it. Fixtures and page objects are
complementary here, not alternatives: fixtures provide lifecycle and dependency
injection; page objects provide a named, reusable vocabulary of locators and actions.

Conventions:

- Locators are public `readonly` properties; page objects contain **no assertions**.
  Tests assert, so a failure points at the test rather than a helper.
- Methods are user actions (`login(email, password)`, `addComment(text)`), not raw clicks.
  Actions that can legitimately fail (`publish()`) don't wait for navigation.
- Shared UI (`Header`, `ArticleList`) is a **component object composed into pages**, not
  a base class pages inherit from.
- Authentication is not a page-object concern. Tests that need a signed-in user request
  `authenticatedPage`, which shares the same `Page` instance.

**Locator strategy, in order of preference:**

1. Role + accessible name (`getByRole`).
2. Placeholder (`getByPlaceholder`) — the only hook form fields offer.
3. Classes from the shared RealWorld theme (`.navbar`, `.banner`, `.error-messages`,
   `.card`, ...) — only where no role or text hook exists, and only classes the RealWorld
   spec's common stylesheet defines, which every implementation shares. Never Angular's
   generated `_ngcontent-*` attributes.

Supporting rules: name matching for icon+text buttons goes through `iconLabel()`;
duplicated controls are scoped to their region rather than picked with `.first()`
(`no-nth-methods` is enforced by lint, along with `no-wait-for-timeout` and
`no-force-option`); bare-icon controls are located by icon class with a comment saying why.

## Consequences

**Positive**

- Tests read as intent (`await articlePage.addComment(text)`) and never contain a raw
  selector, so an upstream markup change is fixed in one page object, not across specs.
- Fixture injection gives per-test isolation for free: each test gets its own `Page`, and
  page objects hold no cross-test state, which is what makes full parallelism safe.
- Keeping assertions in tests, and composing rather than inheriting, avoids the two usual
  ways page-object layers rot (opaque failures and deep base-class hierarchies).
- The same page objects will serve the visual and a11y suites (not yet written), so those won't grow their own
  copies of the locators.

**Negative**

- Fixture registration is boilerplate: eight near-identical three-line fixtures in
  `base.ts`, and a new page means touching two files.
- A page object never authenticates itself, so forgetting `authenticatedPage` in a test
  silently yields an anonymous session. Protected pages redirect to login, which usually
  surfaces the mistake quickly, but it is a convention, not a guarantee.
- Falling back to theme classes and icon classes is more brittle than accessible
  locators. That risk is contained rather than removed: the upstream commit is pinned
  ([0002](0002-pin-upstream-app-versions.md)), so a markup change only lands when we bump.
- The icon-glyph behaviour behind `iconLabel()` was verified on Chromium only, which is
  the only browser the projects run today. Adding Firefox or WebKit means re-checking it.
- Placeholder-only form fields are a weak substitute for labels (the text vanishes as soon
  as you type), and the locator strategy leans on them. Automated a11y scanning won't
  flag this: axe-core accepts a placeholder as an accessible name, and the a11y suite's
  scan of the login and register pages reports no `label` violation. It stays a manual
  finding.

## Alternatives considered

- **Classic page objects, constructed by hand** (`new ArticlePage(page)` in each test) —
  rejected. Repetitive, and it can't express dependencies between setup pieces the way
  fixtures do.
- **Fixtures only, no page objects** — rejected. Locators and multi-step actions would be
  duplicated across the ui, visual and a11y suites, so one markup change would mean
  editing many specs.
- **`data-testid` locators** — the usual senior default, but not available: we don't
  control the app's markup and won't fork it to add attributes. If that changed, test IDs
  would move to the top of the preference order above.
- **Screenplay pattern** — rejected as more indirection than this suite's size warrants.
- **Page objects that assert internally** (`expectLoaded()`, `expectTitle()`) — rejected;
  it hides which expectation failed and couples reusable helpers to one test's intent.
