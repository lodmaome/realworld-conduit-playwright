import type { Page, Route } from '@playwright/test';
import type { User } from '@api-client/client';
import type { components } from '@api-client/schema';

type Schemas = components['schemas'];

// Typed from the generated OpenAPI schema, so a stub can't silently drift from the
// shapes the real API returns (docs/adr/0001-api-mocking-strategy.md).
export type StubArticle = Schemas['Conduit.Domain.Article'];
export type StubComment = Schemas['Conduit.Domain.Comment'];
export type StubProfile = Schemas['Conduit.Features.Profiles.Profile'];
// The client's User, not the raw generated one: the token is always present on a real response.
export type StubUser = User;

/**
 * How one request should be answered instead of by the fixed stubs: a failure status with
 * an error body, or a dropped connection. Optionally held back until `until` settles, so a
 * test can freeze the app in its loading state and release it on demand (see `deferred`).
 */
export type ApiOverride = {
  /** Defaults to GET. */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Matched against the path without its `/api` prefix; a string must match it exactly. */
  path: string | RegExp;
  /** When given, every listed query parameter must be present with this value. */
  query?: Record<string, string>;
  until?: Promise<unknown>;
} & ({ status: number; body?: unknown } | { abort: true });

export type ApiMockConfig = {
  /** Signs the app in: seeds its token and answers `GET /user`. Omit for an anonymous visitor. */
  user?: StubUser;
  /**
   * Checked before everything below, first match wins. This is the only way to answer a
   * non-GET request, and the way to make a request that would normally succeed fail.
   */
  overrides?: ApiOverride[];
  /** The global feed (`GET /articles`); also where single articles are looked up. */
  articles?: StubArticle[];
  /** The signed-in user's "Your Feed" (`GET /articles/feed`). */
  feed?: StubArticle[];
  tags?: string[];
  /** Comments by article slug. */
  comments?: Record<string, StubComment[]>;
  profiles?: StubProfile[];
};

export type ApiMock = {
  /** Requests under /api/ that no stub answered — a test should treat any as a failure. */
  unmatched: string[];
};

// The frontend is served from one origin and calls the API on another, so every stubbed
// response is cross-origin and needs CORS headers, and a request carrying an Authorization
// header is preceded by a preflight. `authorization` must be listed explicitly: a `*`
// wildcard in Allow-Headers does not cover it.
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

type Stubbed = { status: number; body: unknown };

const ok = (body: unknown): Stubbed => ({ status: 200, body });
const notFound = (what: string): Stubbed => ({
  status: 404,
  body: { errors: { [what]: ['not found'] } },
});

/** The error body the real API sends: `{ errors: { field: [messages] } }`. */
export const apiErrors = (errors: Record<string, string[]>) => ({ errors });

/** A promise a test settles by hand: `await` it in the app's path, `resolve()` from the test. */
export function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

function overrideFor(config: ApiMockConfig, method: string, url: URL): ApiOverride | undefined {
  const path = url.pathname.replace(/^\/api/, '');
  return config.overrides?.find(
    (o) =>
      (o.method ?? 'GET') === method &&
      (typeof o.path === 'string' ? o.path === path : o.path.test(path)) &&
      Object.entries(o.query ?? {}).every(([key, value]) => url.searchParams.get(key) === value),
  );
}

function pageOf(articles: StubArticle[], url: URL): Stubbed {
  const tag = url.searchParams.get('tag');
  const author = url.searchParams.get('author');
  const limit = Number(url.searchParams.get('limit') ?? articles.length);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  const matching = articles.filter(
    (article) =>
      (!tag || article.tagList?.includes(tag)) && (!author || article.author?.username === author),
  );
  return ok({ articles: matching.slice(offset, offset + limit), articlesCount: matching.length });
}

export function stubFor(config: ApiMockConfig, url: URL): Stubbed | undefined {
  const path = url.pathname.replace(/^\/api/, '');
  const articles = config.articles ?? [];

  // The body the real API sends (checked by tests/api/stubs-match-contract.spec.ts).
  if (path === '/user') {
    return config.user
      ? ok({ user: config.user })
      : { status: 401, body: { errors: { token: ['is missing'] } } };
  }
  if (path === '/tags') return ok({ tags: config.tags ?? [] });
  if (path === '/articles/feed') return pageOf(config.feed ?? [], url);
  if (path === '/articles') return pageOf(articles, url);

  const comments = path.match(/^\/articles\/([^/]+)\/comments$/);
  if (comments) return ok({ comments: config.comments?.[comments[1]!] ?? [] });

  const article = path.match(/^\/articles\/([^/]+)$/);
  if (article) {
    const found = [...articles, ...(config.feed ?? [])].find((a) => a.slug === article[1]);
    return found ? ok({ article: found }) : notFound('article');
  }

  const profile = path.match(/^\/profiles\/([^/]+)$/);
  if (profile) {
    const username = decodeURIComponent(profile[1]!);
    const found = config.profiles?.find((p) => p.username === username);
    return found ? ok({ profile: found }) : notFound('profile');
  }

  return undefined;
}

/**
 * Replaces the network for one page: the API is answered from `config`, the app's own
 * origin passes through, and everything else — the Google Fonts and Ionicons CDN links in
 * the frontend's index.html — is blocked. Blocking those makes rendering depend only on
 * the fonts baked into the test image, never on the internet.
 *
 * Must be installed before the first navigation.
 */
export async function installApiMock(
  page: Page,
  appBaseUrl: string,
  config: ApiMockConfig,
): Promise<ApiMock> {
  const appOrigin = new URL(appBaseUrl).origin;
  const mock: ApiMock = { unmatched: [] };

  if (config.user) {
    await page.addInitScript((token) => {
      window.localStorage.setItem('jwtToken', token);
    }, config.user.token);
  }

  const fulfil = (route: Route, { status, body }: Stubbed) =>
    route.fulfill({
      status,
      headers: CORS_HEADERS,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.startsWith('/api/')) {
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS_HEADERS });
      }
      const override = overrideFor(config, request.method(), url);
      if (override) {
        await override.until;
        // The test can end while a response is still held back; the page is gone by then.
        if (page.isClosed()) return;
        if ('abort' in override) return route.abort('failed');
        return fulfil(route, { status: override.status, body: override.body ?? {} });
      }

      const stub = request.method() === 'GET' ? stubFor(config, url) : undefined;
      if (stub) return fulfil(route, stub);

      mock.unmatched.push(`${request.method()} ${url.pathname}${url.search}`);
      return fulfil(route, {
        status: 501,
        body: { errors: { stub: ['no stub for this request'] } },
      });
    }

    return url.origin === appOrigin ? route.continue() : route.abort('blockedbyclient');
  });

  return mock;
}
