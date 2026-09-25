import { buildTag } from '@factories/article-factory';
import { expect, test } from '../fixtures/base';
import { bodyOf, knownIssue, type ArticlesBody, type ErrorBody } from '../support/api-shapes';
import { expectContract } from '../support/contract';

// Every test owns its data: articles carry a tag or an author no other test uses, and the list
// is filtered by it, so the shared database and parallel workers cannot change the answer.

test.describe('listing articles', () => {
  test('filters by tag', async ({ apiClient, userFactory, articleFactory }) => {
    const author = await userFactory();
    const tag = buildTag();
    const tagged = [
      await articleFactory(author, { tagList: [tag] }),
      await articleFactory(author, { tagList: [tag] }),
    ];
    await articleFactory(author, { tagList: [buildTag()] });

    const res = await apiClient.send('GET', 'articles', { params: { tag } });

    expect(res.status).toBe(200);
    expectContract('GET /api/articles', res, { source: 'openapi' });
    const { articles, articlesCount } = bodyOf<ArticlesBody>(res);
    expect(articles.map((a) => a.slug).sort()).toEqual(tagged.map((a) => a.slug).sort());
    expect(articlesCount).toBe(2);
  });

  test('filters by author, and an unknown author has none', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const [author, other] = [await userFactory(), await userFactory()];
    const mine = [await articleFactory(author), await articleFactory(author)];
    await articleFactory(other);

    const res = await apiClient.send('GET', 'articles', { params: { author: author.username } });
    const nobody = await apiClient.send('GET', 'articles', {
      params: { author: `nobody-${author.username}` },
    });

    expect(
      bodyOf<ArticlesBody>(res)
        .articles.map((a) => a.slug)
        .sort(),
    ).toEqual(mine.map((a) => a.slug).sort());
    expect(bodyOf<ArticlesBody>(nobody)).toEqual({ articles: [], articlesCount: 0 });
  });

  test('filters by who favorited', async ({ apiClient, userFactory, articleFactory }) => {
    const [author, fan] = [await userFactory(), await userFactory()];
    const liked = await articleFactory(author);
    await articleFactory(author);
    await apiClient.send('POST', `articles/${liked.slug}/favorite`, { token: fan.token });

    const res = await apiClient.send('GET', 'articles', { params: { favorited: fan.username } });

    expect(bodyOf<ArticlesBody>(res).articles.map((a) => a.slug)).toEqual([liked.slug]);
  });

  test('lists newest first, and pages with limit and offset', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const author = await userFactory();
    const tag = buildTag();
    const oldest = await articleFactory(author, { tagList: [tag] });
    const middle = await articleFactory(author, { tagList: [tag] });
    const newest = await articleFactory(author, { tagList: [tag] });
    const page = async (limit: number, offset: number) =>
      bodyOf<ArticlesBody>(
        await apiClient.send('GET', 'articles', { params: { tag, limit, offset } }),
      );

    const first = await page(2, 0);
    const second = await page(2, 2);
    const beyond = await page(2, 3);

    expect(first.articles.map((a) => a.slug)).toEqual([newest.slug, middle.slug]);
    expect(second.articles.map((a) => a.slug)).toEqual([oldest.slug]);
    expect(beyond.articles).toEqual([]);
    // The count is the whole match, not the size of the page.
    expect([first.articlesCount, second.articlesCount, beyond.articlesCount]).toEqual([3, 3, 3]);
  });

  test('a limit of 0 returns no articles but still the count', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const author = await userFactory();
    const tag = buildTag();
    await articleFactory(author, { tagList: [tag] });

    const res = await apiClient.send('GET', 'articles', { params: { tag, limit: 0 } });

    expect(bodyOf<ArticlesBody>(res)).toEqual({ articles: [], articlesCount: 1 });
  });

  test('a limit or offset that is not a whole number is refused with 422', async ({
    apiClient,
  }) => {
    const notANumber = await apiClient.send('GET', 'articles', { params: { limit: 'abc' } });
    const fraction = await apiClient.send('GET', 'articles', { params: { offset: '2.5' } });

    expect(notANumber.status).toBe(422);
    expectContract('GET /api/articles', notANumber);
    expect(Object.keys(bodyOf<ErrorBody>(notANumber).errors)).toContain('limit');
    expect(fraction.status).toBe(422);
    expect(Object.keys(bodyOf<ErrorBody>(fraction).errors)).toContain('offset');
  });

  test('the tag filter is case-sensitive', async ({ apiClient, userFactory, articleFactory }) => {
    const author = await userFactory();
    const tag = buildTag();
    await articleFactory(author, { tagList: [tag] });

    const exact = await apiClient.send('GET', 'articles', { params: { tag } });
    const shouted = await apiClient.send('GET', 'articles', { params: { tag: tag.toUpperCase() } });

    expect(bodyOf<ArticlesBody>(exact).articlesCount).toBe(1);
    expect(bodyOf<ArticlesBody>(shouted).articlesCount).toBe(0);
  });

  test('list items leave out the body', async ({ apiClient, userFactory, articleFactory }) => {
    const author = await userFactory();
    await articleFactory(author);

    const res = await apiClient.send('GET', 'articles', { params: { author: author.username } });

    expect(bodyOf<ArticlesBody>(res).articles[0]).not.toHaveProperty('body');
  });
});

test.describe('your feed', () => {
  test('needs a token', async ({ apiClient }) => {
    const res = await apiClient.send('GET', 'articles/feed');

    expect(res.status).toBe(401);
    expectContract('GET /api/articles/feed', res);
  });

  test('is empty for a user who follows nobody', async ({ apiClient, userFactory }) => {
    const user = await userFactory();

    const res = await apiClient.send('GET', 'articles/feed', { token: user.token });

    expect(res.status).toBe(200);
    expectContract('GET /api/articles/feed', res, { source: 'openapi' });
    expect(bodyOf<ArticlesBody>(res)).toEqual({ articles: [], articlesCount: 0 });
  });

  test('holds only the articles of followed authors, newest first, marked as followed', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const [reader, followed, stranger] = [
      await userFactory(),
      await userFactory(),
      await userFactory(),
    ];
    const older = await articleFactory(followed);
    const newer = await articleFactory(followed);
    await articleFactory(stranger);
    await apiClient.send('POST', `profiles/${followed.username}/follow`, { token: reader.token });

    const res = await apiClient.send('GET', 'articles/feed', { token: reader.token });

    const { articles, articlesCount } = bodyOf<ArticlesBody>(res);
    expect(articles.map((a) => a.slug)).toEqual([newer.slug, older.slug]);
    expect(articles.every((a) => a.author.following)).toBe(true);
    expect(articlesCount).toBe(2);
  });

  test('pages with limit and offset', async ({ apiClient, userFactory, articleFactory }) => {
    const [reader, followed] = [await userFactory(), await userFactory()];
    const older = await articleFactory(followed);
    const newer = await articleFactory(followed);
    await apiClient.send('POST', `profiles/${followed.username}/follow`, { token: reader.token });
    const page = async (offset: number) =>
      bodyOf<ArticlesBody>(
        await apiClient.send('GET', 'articles/feed', {
          token: reader.token,
          params: { limit: 1, offset },
        }),
      );

    const [first, second] = [await page(0), await page(1)];

    expect(first.articles.map((a) => a.slug)).toEqual([newer.slug]);
    expect(second.articles.map((a) => a.slug)).toEqual([older.slug]);
    expect(first.articlesCount).toBe(2);
  });
});

test.describe('known backend defects: listing', () => {
  test('a negative limit or offset is accepted instead of refused', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    knownIssue('Negative limit and offset are accepted, while "abc" and "2.5" are rejected.');
    const author = await userFactory();
    const tag = buildTag();
    await articleFactory(author, { tagList: [tag] });
    await articleFactory(author, { tagList: [tag] });

    const noLimit = await apiClient.send('GET', 'articles', { params: { tag, limit: -1 } });
    const noOffset = await apiClient.send('GET', 'articles', { params: { tag, offset: -1 } });

    // Read as "no limit" and "no offset".
    expect(noLimit.status).toBe(200);
    expect(bodyOf<ArticlesBody>(noLimit).articles).toHaveLength(2);
    expect(noOffset.status).toBe(200);
    expect(bodyOf<ArticlesBody>(noOffset).articles).toHaveLength(2);
  });
});
