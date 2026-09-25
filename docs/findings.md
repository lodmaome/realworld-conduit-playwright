# Findings: defects and gaps found in the application under test

What this test suite found in the RealWorld "Conduit" app, with how to reproduce each item. All of it
was observed on **2026-09-25** against the pinned versions:

- backend `realworld-apps/aspnetcore-realworld-example-app` at `a397d1197b22edeffa4d2563fa5f4f7f11d0b254`
- frontend `realworld-apps/angular-realworld-example-app` at `dd99ed2cf39c805d719f943c5d7061a5683d98a8`

Every item is **pinned by a test** that asserts the behaviour as observed and carries a `known-issue`
annotation, so it is a regression check today and fails on purpose the day the app is fixed (see
[ADR-0013](adr/0013-api-overrides-for-the-mocked-ui-project.md) and
[ADR-0015](adr/0015-validate-responses-against-the-contract.md)). None of these have been reported
upstream yet.

This is a list of what was found, not a security review. Severity is not assigned: an "impact" line says
what a user would see, and reading it is left to the reader.

| ID  | Where    | Finding                                                                           |
| --- | -------- | --------------------------------------------------------------------------------- |
| B1  | backend  | A duplicate tag in `tagList` on create is an unhandled `500`                      |
| B2  | backend  | Editing an article's `tagList` is an unhandled `500`                              |
| B3  | backend  | Email addresses are not validated                                                 |
| B4  | backend  | Email uniqueness is case-sensitive                                                |
| B5  | backend  | A token stops working after its user is renamed: `404` on reads, `500` on writes  |
| B6  | backend  | An invalid token is reported as a missing one                                     |
| B7  | backend  | A user can follow themselves                                                      |
| B8  | backend  | `favorited` is true for every viewer once anyone has favorited an article         |
| B9  | backend  | `author.following` is always false on a single-article `GET`                      |
| B10 | backend  | A blank title is ignored on update but rejected on create                         |
| B11 | backend  | A negative `limit` or `offset` is accepted, while `abc` and `2.5` are refused     |
| S1  | OpenAPI  | The spec declares only `200`, no body for five operations, and no required fields |
| F1  | frontend | A failed request for a list leaves "Loading articles..." on screen for good       |
| F2  | frontend | A failed tags request leaves "Loading tags..." on screen for good                 |
| F3  | frontend | An unknown article, or a failed comments request, blanks the whole article page   |
| F4  | frontend | A profile that can't be loaded renders a blank page                               |
| F5  | frontend | Editing an article that doesn't exist opens an empty editor with no error         |
| F6  | frontend | A failed follow, favorite or article delete tells the user nothing                |
| F7  | frontend | A long unbroken word makes the page scroll sideways                               |

## Backend

To reproduce, start the stack (`npm run docker:up`). These use a throwaway user each; change the
names if you run them twice.

```bash
BASE=http://localhost:8080/api
H='content-type: application/json'
register() { curl -s -X POST $BASE/users -H "$H" \
  -d "{\"user\":{\"username\":\"$1\",\"email\":\"$1@example.test\",\"password\":\"password-123\"}}"; }
token() { register "$1" | node -pe 'JSON.parse(require("fs").readFileSync(0)).user.token'; }
```

### B1. A duplicate tag on create is an unhandled `500`

```bash
T=$(token alice1)
curl -s -w ' -> %{http_code}\n' -X POST $BASE/articles -H "$H" -H "Authorization: Token $T" \
  -d '{"article":{"title":"dup tags","description":"d","body":"b","tagList":["x","x"]}}'
# {"errors":"InternalServerError"} -> 500
```

Distinct tags are fine, including several new ones, spaces and case variants; only the same tag twice in
one request fails, whether the tag is new or existing. **Impact:** a client that doesn't deduplicate
gets a server error, and the body is a string where every other error is `{ errors: { field: [...] } }`.
Pinned in `tests/api/articles.spec.ts` (known backend defects: articles).

### B2. Editing the `tagList` is an unhandled `500`

```bash
SLUG=$(curl -s -X POST $BASE/articles -H "$H" -H "Authorization: Token $T" \
  -d '{"article":{"title":"edit tags","description":"d","body":"b"}}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).article.slug')
curl -s -w ' -> %{http_code}\n' -X PUT $BASE/articles/$SLUG -H "$H" -H "Authorization: Token $T" \
  -d '{"article":{"tagList":["y"]}}'
# {"errors":"InternalServerError"} -> 500
```

**Impact:** an article's tags can't be changed after publishing. Pinned in `tests/api/articles.spec.ts`.

### B3. Email addresses are not validated

```bash
curl -s -w ' -> %{http_code}\n' -X POST $BASE/users -H "$H" \
  -d '{"user":{"username":"carol1","email":"no-at-sign-carol1","password":"password-123"}}'
# {"user":{"username":"carol1","email":"no-at-sign-carol1", ...}} -> 201  (and the same on PUT /user)
```

**Impact:** accounts with unusable addresses. Pinned in `tests/api/auth.spec.ts` (known backend
defects: accounts).

### B4. Email uniqueness is case-sensitive

Registering `jane@example.test`, then `JANE@EXAMPLE.TEST`, creates two accounts. **Impact:** one person
can hold several accounts with the same address. Pinned in `tests/api/auth.spec.ts`.

### B5. A token stops working after its user is renamed

`PUT /user` with a new `username` returns a fresh token, but the old token, which names the old
username, is orphaned:

```bash
OLD=$(token dave1)
curl -s -X PUT $BASE/user -H "$H" -H "Authorization: Token $OLD" -d '{"user":{"username":"dave1-renamed"}}' >/dev/null
curl -s -w ' -> %{http_code}\n' $BASE/user -H "Authorization: Token $OLD"
# {"errors":{"user":["not found"]}} -> 404
curl -s -w ' -> %{http_code}\n' -X POST $BASE/articles -H "$H" -H "Authorization: Token $OLD" \
  -d '{"article":{"title":"stale","description":"d","body":"b"}}'
# {"errors":"InternalServerError"} -> 500
```

**Impact:** another session left signed in on the old name gets a `404` reading its account and a `500`
writing. Pinned in `tests/api/auth.spec.ts`.

### B6. An invalid token is reported as a missing one

`GET /user` with `Authorization: Token garbage` answers `401 {"errors":{"token":["is missing"]}}`, the
same message as no header at all. **Impact:** a misleading message when debugging. Pinned in
`tests/api/auth.spec.ts`.

### B7. A user can follow themselves

```bash
curl -s -X POST $BASE/profiles/erin1/follow -H "Authorization: Token $(token erin1)"
# {"profile":{"username":"erin1", ..., "following":true}}
```

**Impact:** a user's own articles appear in their own feed as "followed". Pinned in
`tests/api/social.spec.ts`.

### B8. `favorited` is true for every viewer once anyone has favorited an article

After one user favorites an article, the flag is `true` for anonymous callers, the author, and users who
never favorited it, on `GET /articles/{slug}` and in lists. It is `false` again only when the count
returns to 0. `favoritesCount` is right.

```bash
A=$(token fran1); B=$(token gus1)
SLUG=$(curl -s -X POST $BASE/articles -H "$H" -H "Authorization: Token $A" \
  -d '{"article":{"title":"fav flag","description":"d","body":"b"}}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).article.slug')
curl -s -X POST $BASE/articles/$SLUG/favorite -H "Authorization: Token $B" >/dev/null
curl -s $BASE/articles/$SLUG | node -pe 'JSON.parse(require("fs").readFileSync(0)).article.favorited'
# true, for an anonymous caller
```

**Impact:** a client that reads the flag shows every reader an article as "favorited by you" that they
did not favorite. Pinned in `tests/api/social.spec.ts`.

### B9. `author.following` is always false on a single-article `GET`

For a follower, the profile endpoint, article lists and the feed say `following: true`; the single
article says `false`:

```bash
curl -s -X POST $BASE/profiles/fran1/follow -H "Authorization: Token $B" >/dev/null
curl -s $BASE/articles/$SLUG -H "Authorization: Token $B" | node -pe 'JSON.parse(require("fs").readFileSync(0)).article.author.following'
# false
curl -s $BASE/profiles/fran1 -H "Authorization: Token $B" | node -pe 'JSON.parse(require("fs").readFileSync(0)).profile.following'
# true
```

**Impact:** the same author, the same viewer, two answers. Pinned in `tests/api/social.spec.ts`.

### B10. A blank title is ignored on update but rejected on create

Create with `"title": ""` is `422 {"title":["can't be blank"]}`; update with `"title": ""` is `200` and
the title is unchanged. **Impact:** an inconsistency, no data loss. Pinned in `tests/api/articles.spec.ts`.

### B11. A negative `limit` or `offset` is accepted

`?limit=abc` and `?limit=2.5` are `422`, but `?limit=-1` returns every match (so it acts as no limit)
and `?offset=-1` acts as `0`. **Impact:** inconsistent input validation; `limit=-1` is an unbounded
read. Pinned in `tests/api/listing.spec.ts`.

## The OpenAPI spec

### S1. The published contract is much thinner than the backend

- **Only `200` is declared** for every operation. The backend also answers `201` (the three creates),
  `204` (the two deletes), `401`, `403`, `404`, `409` and `422`.
- **Five operations declare no response body:** create user, create article, create comment, delete
  article, delete comment.
- **No schema declares a `required` field**, so every property is optional and most are nullable.
- The error body is `{ errors: { field: [...] } }` everywhere except unhandled failures
  (B1, B2, B5), where it is `{ errors: "InternalServerError" }`.

`api-client/contract.ts` makes up for this with labelled supplements from observation, and
`tests/api/spec-gaps.spec.ts` pins each gap and fails when a backend bump closes it
([ADR-0015](adr/0015-validate-responses-against-the-contract.md)).

## Frontend

These were found by making the API fail with stubs (the `ui-mocked` project). To reproduce one by hand,
open the app, open the browser's developer tools, and block the request in the Network panel ("Block
request URL" on `/api/articles`, for example), then reload.

### F1. A failed request for a list leaves "Loading articles..." for good

The global feed, Your Feed, a profile's Favorited Posts, and moving to another page all behave the same:
a `500` or a dropped connection leaves the loading message with no error. A failed page change also
removes the articles already on screen and the page buttons, so the reader can't go back without a
reload (switching between the Global Feed and Your Feed tabs still works). **Impact:** no way to tell a
slow response from a failed one. Pinned in `tests/ui-mocked/home.spec.ts` and `profile.spec.ts`.

### F2. A failed tags request leaves "Loading tags..." for good

The feed beside it works. While the request is pending the sidebar isn't in the page at all; on a
failure it appears reading "Loading tags...". **Impact:** as F1. Pinned in `tests/ui-mocked/home.spec.ts`.

### F3. An unknown article, or a failed comments request, blanks the whole article page

An article the API says doesn't exist (`404`) renders nothing: no title, no body, no message. So does an
article whose _comments_ request fails, even though the article itself loaded, because the two are
fetched together. **Impact:** a comments outage takes every article page down. Pinned in
`tests/ui-mocked/article.spec.ts`.

### F4. A profile that can't be loaded renders a blank page

A `404` and a `500` both render no user, no articles and no message. The real-backend test
`tests/ui/profile.spec.ts` ("a profile that does not exist shows an error") only asserts the username is
hidden, so it doesn't see this; that test is left as it is and noted in the
[test strategy](test-strategy.md). Pinned in `tests/ui-mocked/profile.spec.ts`.

### F5. Editing an article that doesn't exist opens an empty editor

`/editor/<unknown-slug>` shows a blank editor as if for a new article, with no error. Saving from it
would send an update for an article that isn't there. Pinned in `tests/ui-mocked/editor.spec.ts`.

### F6. A failed follow, favorite or article delete tells the user nothing

After a failed follow or favorite the button and the count are left as they were, which is right, but
no message says it didn't work; this is the same on a profile, in the feed and on the article page. A
failed article delete leaves the author on the article with no error. (A failed _comment_ delete does
show its error.) Pinned in `tests/ui-mocked/profile.spec.ts`, `home.spec.ts` and `article.spec.ts`.

### F7. A long unbroken word makes the page scroll sideways

400 characters with no spaces in an article body gave a 5826px-wide page against 1280px; the same 400
characters split by spaces, and ordinary long text, did not. **Impact:** a long URL or a hash in a
post breaks the layout. Pinned in `tests/ui-mocked/article.spec.ts`.

## Checked and fine

So the list above is read against what was tried and behaved:

- **Authorisation.** Editing or deleting someone else's article, and deleting someone else's comment,
  are `403` and leave the data untouched. A wrong password and an unknown email get the identical
  `401`, so accounts can't be probed. Both the `Token` and `Bearer` schemes are accepted, and a bare
  token is refused.
- **Idempotence.** Favoriting, unfavoriting, following and unfollowing twice are harmless.
- **Pagination.** The count is the whole match; newest first; `limit=0` returns nothing but the count;
  the page-count arithmetic is right at the boundaries.
- **Rendering.** Markup in an article is inert: a `<script>` never runs, an `onerror` handler is
  dropped, a `javascript:` link is neutralised, and a title containing `<b>` is shown as text.
- **Double submit.** The publish, settings and sign-up buttons disable themselves while a request is
  in flight, and a second click sends nothing. (Playwright's `dblclick()` reports a double-submit that
  no mouse can produce, because it sends both clicks in one JavaScript task; measured in ADR-0013.)
- **Sessions.** A token the API rejects signs the visitor out and is removed from storage.
