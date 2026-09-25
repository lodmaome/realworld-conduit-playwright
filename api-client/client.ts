import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { components } from './schema';

type Schemas = components['schemas'];

// Generated types mark every field nullable/optional because the OpenAPI spec does
// (ASP.NET nullable reference types round-trip that way), even though a successful
// response always populates them. `User`/`Article` narrow to what a caller can
// actually rely on; the `assert*` functions are where that gap gets checked at
// runtime instead of asserted away.
type GeneratedUser = Schemas['Conduit.Features.Users.User'];
export type User = {
  [K in 'username' | 'email' | 'token']-?: NonNullable<GeneratedUser[K]>;
} & Pick<GeneratedUser, 'bio' | 'image'>;

type GeneratedArticle = Schemas['Conduit.Domain.Article'];
export type Article = {
  [K in 'slug' | 'title' | 'description' | 'body']-?: NonNullable<GeneratedArticle[K]>;
} & Pick<GeneratedArticle, 'author' | 'favorited' | 'favoritesCount' | 'tagList'>;

export type RegisterInput = { username: string; email: string; password: string };
export type LoginInput = { email: string; password: string };
export type ArticleInput = { title: string; description: string; body: string; tagList?: string[] };

function assertUser(user: GeneratedUser | undefined, context: string): User {
  if (!user || !user.username || !user.email || !user.token) {
    throw new Error(
      `${context}: response did not include a complete user (got ${JSON.stringify(user)})`,
    );
  }
  return user as User;
}

function assertArticle(article: GeneratedArticle | undefined, context: string): Article {
  if (!article || !article.slug || !article.title || !article.description || !article.body) {
    throw new Error(
      `${context}: response did not include a complete article (got ${JSON.stringify(article)})`,
    );
  }
  return article as Article;
}

async function expectOk(res: APIResponse, action: string): Promise<void> {
  if (!res.ok()) {
    throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  }
}

const authHeader = (token: string) => ({ Authorization: `Token ${token}` });

/** What the API answered, without judging it: the API suite asserts on errors as well as successes. */
export type ApiResult<Body = unknown> = { status: number; body: Body };

export type SendOptions = {
  /** Sent as `Authorization: Token <token>`. */
  token?: string;
  /** Sent as the whole Authorization header, to test other schemes and malformed values. */
  authorization?: string;
  data?: unknown;
  params?: Record<string, string | number>;
};

export function createApiClient(request: APIRequestContext) {
  // No leading slash on any path below: the request context's baseURL includes the
  // /api prefix (see tests/fixtures/base.ts), and WHATWG URL joining treats a
  // leading-slash path as absolute, silently discarding that prefix. Verified via
  // `new URL('/users', 'http://host/api')` -> http://host/users, not .../api/users.
  return {
    /**
     * Any call, returning the status and parsed body whatever they are. The typed methods below
     * throw on a non-2xx, which is right for set-up and wrong for a test of an error response.
     * `path` follows the same no-leading-slash rule as everything here.
     */
    async send(
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      { token, authorization, data, params }: SendOptions = {},
    ): Promise<ApiResult> {
      const headers: Record<string, string> = {};
      if (authorization !== undefined) headers.Authorization = authorization;
      else if (token !== undefined) Object.assign(headers, authHeader(token));

      const res = await request.fetch(path, { method, headers, data, params });
      const text = await res.text();
      let body: unknown = text === '' ? undefined : text;
      try {
        if (text !== '') body = JSON.parse(text);
      } catch {
        // Not JSON: keep the text, so a test can see what it got.
      }
      return { status: res.status(), body };
    },

    async register(input: RegisterInput): Promise<User> {
      const res = await request.post('users', { data: { user: input } });
      await expectOk(res, 'register');
      const body = (await res.json()) as Schemas['Conduit.Features.Users.UserEnvelope'];
      return assertUser(body.user, 'register');
    },

    async login(input: LoginInput): Promise<User> {
      const res = await request.post('users/login', { data: { user: input } });
      await expectOk(res, 'login');
      const body = (await res.json()) as Schemas['Conduit.Features.Users.UserEnvelope'];
      return assertUser(body.user, 'login');
    },

    async getCurrentUser(token: string): Promise<User> {
      const res = await request.get('user', { headers: authHeader(token) });
      await expectOk(res, 'getCurrentUser');
      const body = (await res.json()) as Schemas['Conduit.Features.Users.UserEnvelope'];
      return assertUser(body.user, 'getCurrentUser');
    },

    async createArticle(token: string, input: ArticleInput): Promise<Article> {
      const res = await request.post('articles', {
        data: { article: input },
        headers: authHeader(token),
      });
      await expectOk(res, 'createArticle');
      const body = (await res.json()) as Schemas['Conduit.Features.Articles.ArticleEnvelope'];
      return assertArticle(body.article, 'createArticle');
    },

    async addComment(token: string, slug: string, body: string): Promise<void> {
      const res = await request.post(`articles/${slug}/comments`, {
        data: { comment: { body } },
        headers: authHeader(token),
      });
      await expectOk(res, 'addComment');
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
