# pages

Page objects, each exposed as its own Playwright fixture (fixture-composed POM) — a
test destructures `{ articlePage }` and gets a ready object, rather than calling
`new ArticlePage(page)` by hand. Fixtures are wired in
[`tests/fixtures/base.ts`](../tests/fixtures/base.ts).

## Conventions

- **Locators are public readonly properties; page objects contain no assertions.**
  Tests assert (`expect(articlePage.title).toHaveText(...)`) so a failure points at the
  test, not at a helper.
- **Methods are user actions**, not clicks: `login(email, password)`, `addComment(text)`.
  `publish()` only clicks — it doesn't wait for navigation, because a validation
  failure legitimately stays on the page.
- **Shared UI is a component object** (`components/`): `Header` (every page) and
  `ArticleList` (home feed and profile tabs), composed rather than inherited.
- **Authentication is not a page-object concern.** Tests that need a signed-in user
  request the `authenticatedPage` fixture, which shares the same `Page`.

## Locator strategy, as found in the app

We can't add test IDs to the app, so locators follow what its markup actually offers.
In order of preference:

1. **Role + name** (`getByRole`) — links, headings, most buttons.
2. **Placeholder** (`getByPlaceholder`) — every form field. The app has no `<label>`s,
   so placeholders are the only accessible hook (axe-core accepts a placeholder as a name, so this isn't flagged by the a11y suite).
3. **Shared RealWorld theme classes** (`.navbar`, `.banner`, `.error-messages`,
   `.article-preview`, `.card`, ...) — only where there is no role or text hook, and only
   classes defined by the RealWorld spec's common stylesheet, which every implementation
   shares. Never Angular's generated `_ngcontent-*` attributes.

Pitfalls verified against the running app:

- **Icon glyphs pollute accessible names.** A button written as
  `<i class="ion-heart"></i> Favorite Article` is named `"<glyph> Favorite Article (0)"`
  — the glyph is CSS-generated content. `exact: true` and `^` anchors never match; use `iconLabel()`
  (`components/icon-label.ts`), which also keeps `Follow bob` from matching `Unfollow bob`.
- **The article page renders its action buttons twice** (banner and footer), so they are
  scoped to `.banner` to satisfy strict mode. `.first()` is deliberately linted against.
- **The header is scoped to `nav.navbar`**: the article page has its own "Sign in" link
  in the comments area.
- **Loading and empty states reuse `.article-preview`**, so real previews are identified
  by the heading they contain.
- **Two controls are bare `<i>` icons with click handlers** (delete comment, remove tag) —
  no role or name exists; they're located by their icon class and noted where used.
