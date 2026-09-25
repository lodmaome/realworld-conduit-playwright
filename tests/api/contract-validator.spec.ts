import { expect, test } from '@playwright/test';
import { checkResponse } from '@api-client/contract';

// The validator is what every other API test leans on, so it is tested first and on its own,
// with no backend: it must reject what it claims to reject, or every "matches the contract"
// assertion after it is decoration.

const person = { username: 'jake', bio: null, image: null, following: false };
const article = {
  slug: 'a-title',
  title: 'A title',
  description: 'About it',
  body: 'The body',
  author: person,
  comments: [],
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  favorited: false,
  favoritesCount: 0,
  tagList: ['one'],
};
const omit = (object: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
const user = { username: 'jake', email: 'jake@example.test', bio: null, image: null, token: 't' };

test.describe('contract validator', () => {
  test('accepts a response the spec declares, and says the schema was the spec', () => {
    const check = checkResponse('GET /api/user', 200, { user });

    expect(check).toEqual({ ok: true, source: 'openapi', errors: [] });
  });

  test('accepts null where the spec marks a field nullable', () => {
    expect(checkResponse('GET /api/user', 200, { user: { ...user, bio: null } }).ok).toBe(true);
  });

  test('rejects a property the spec does not declare, and names it', () => {
    const check = checkResponse('GET /api/user', 200, { user: { ...user, admin: true } });

    expect(check.ok).toBe(false);
    expect(check.errors.join()).toContain('"admin"');
  });

  test('rejects the wrong type', () => {
    const check = checkResponse('GET /api/user', 200, { user: { ...user, username: 42 } });

    expect(check.ok).toBe(false);
    expect(check.errors.join()).toContain('/user/username');
  });

  // The spec declares no `required` anywhere; these come from contract.ts's observed presence.
  test('rejects a missing key the backend is observed to always send', () => {
    const withoutToken = omit(user, 'token');

    const check = checkResponse('GET /api/user', 200, { user: withoutToken });

    expect(check.ok).toBe(false);
    expect(check.errors.join()).toContain("required property 'token'");
  });

  test('rejects a missing envelope', () => {
    expect(checkResponse('GET /api/user', 200, {}).ok).toBe(false);
  });

  test('does not require body on an article, because list items omit it', () => {
    const listItem = omit(article, 'body');

    expect(
      checkResponse('GET /api/articles', 200, { articles: [listItem], articlesCount: 1 }).ok,
    ).toBe(true);
  });

  test('rejects a malformed date-time', () => {
    const check = checkResponse('GET /api/articles/{slug}', 200, {
      article: { ...article, createdAt: 'yesterday' },
    });

    expect(check.ok).toBe(false);
    expect(check.errors.join()).toContain('date-time');
  });

  test('accepts an int32 and rejects a fraction or an overflow', () => {
    const withCount = (favoritesCount: number) =>
      checkResponse('GET /api/articles/{slug}', 200, { article: { ...article, favoritesCount } })
        .ok;

    expect(withCount(12)).toBe(true);
    expect(withCount(1.5)).toBe(false);
    expect(withCount(2 ** 31)).toBe(false);
  });

  test('uses a labelled supplement where the spec declares no body', () => {
    const check = checkResponse('POST /api/users', 201, { user });

    expect(check).toEqual({ ok: true, source: 'supplement', errors: [] });
    expect(checkResponse('POST /api/users', 201, {}).ok).toBe(false);
  });

  test('expects an empty body on a 204', () => {
    expect(checkResponse('DELETE /api/articles/{slug}', 204, undefined).ok).toBe(true);
    expect(checkResponse('DELETE /api/articles/{slug}', 204, { deleted: true }).ok).toBe(false);
  });

  test('accepts the error envelope on a 4xx and rejects other shapes', () => {
    const errors = { errors: { title: ["can't be blank"] } };

    expect(checkResponse('POST /api/articles', 422, errors)).toEqual({
      ok: true,
      source: 'supplement',
      errors: [],
    });
    expect(checkResponse('POST /api/articles', 422, { errors: 'InternalServerError' }).ok).toBe(
      false,
    );
    expect(checkResponse('POST /api/articles', 422, { errors: {}, extra: 1 }).ok).toBe(false);
    expect(checkResponse('POST /api/articles', 422, {}).ok).toBe(false);
  });

  test('refuses to guess at an operation that is not in the spec', () => {
    expect(() => checkResponse('GET /api/nothing', 200, {})).toThrow(/not an operation/);
  });

  test('refuses to guess at a status nothing describes, instead of passing it', () => {
    expect(() => checkResponse('GET /api/user', 500, {})).toThrow(
      /No schema for GET \/api\/user answering 500/,
    );
  });
});
