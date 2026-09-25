import { buildArticle, buildTag } from '@factories/article-factory';
import { expect, test } from '../fixtures/base';
import {
  bodyOf,
  knownIssue,
  slugOf,
  type ArticleBody,
  type ErrorBody,
  type TagsBody,
} from '../support/api-shapes';
import { expectContract } from '../support/contract';

test.describe('creating an article', () => {
  test('returns 201 with the article, its slug, and the author', async ({
    apiClient,
    userFactory,
  }) => {
    const author = await userFactory();
    const input = buildArticle({ tagList: [buildTag(), buildTag()] });

    const res = await apiClient.send('POST', 'articles', {
      token: author.token,
      data: { article: input },
    });

    expect(res.status).toBe(201);
    expectContract('POST /api/articles', res, { source: 'supplement' });
    const { article } = bodyOf<ArticleBody>(res);
    expect(article).toMatchObject({
      title: input.title,
      description: input.description,
      body: input.body,
      tagList: input.tagList,
      favorited: false,
      favoritesCount: 0,
      comments: [],
    });
    expect(article.slug).toBe(slugOf(input.title));
    expect(article.author).toMatchObject({ username: author.username, following: false });
  });

  test('gives a second article with the same title a numbered slug', async ({
    apiClient,
    userFactory,
  }) => {
    const author = await userFactory();
    const input = buildArticle();
    const create = () =>
      apiClient.send('POST', 'articles', { token: author.token, data: { article: input } });

    const [first, second, third] = [await create(), await create(), await create()];

    const slug = slugOf(input.title);
    expect(bodyOf<ArticleBody>(first).article.slug).toBe(slug);
    expect(bodyOf<ArticleBody>(second).article.slug).toBe(`${slug}-1`);
    expect(bodyOf<ArticleBody>(third).article.slug).toBe(`${slug}-2`);
  });

  test('needs a token', async ({ apiClient }) => {
    const res = await apiClient.send('POST', 'articles', { data: { article: buildArticle() } });

    expect(res.status).toBe(401);
    expectContract('POST /api/articles', res);
  });

  test('refuses a blank title and a missing body with 422', async ({ apiClient, userFactory }) => {
    const author = await userFactory();

    const noTitle = await apiClient.send('POST', 'articles', {
      token: author.token,
      data: { article: { ...buildArticle(), title: '' } },
    });
    const noBody = await apiClient.send('POST', 'articles', {
      token: author.token,
      data: { article: { title: buildArticle().title, description: 'd' } },
    });

    expect(noTitle.status).toBe(422);
    expectContract('POST /api/articles', noTitle);
    expect(bodyOf<ErrorBody>(noTitle).errors).toEqual({ title: ["can't be blank"] });
    expect(noBody.status).toBe(422);
    expect(bodyOf<ErrorBody>(noBody).errors).toEqual({ body: ["can't be blank"] });
  });

  test('keeps the tags in the order they were sent and lists them under /tags', async ({
    apiClient,
    userFactory,
  }) => {
    const author = await userFactory();
    const tagList = [buildTag(), buildTag(), buildTag()];

    const res = await apiClient.send('POST', 'articles', {
      token: author.token,
      data: { article: buildArticle({ tagList }) },
    });
    const tags = await apiClient.send('GET', 'tags');

    expect(bodyOf<ArticleBody>(res).article.tagList).toEqual(tagList);
    expectContract('GET /api/tags', tags, { source: 'openapi' });
    expect(bodyOf<TagsBody>(tags).tags).toEqual(expect.arrayContaining(tagList));
  });
});

test.describe('reading an article', () => {
  test('anyone can read it by slug, body included', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const created = await articleFactory(await userFactory());

    const res = await apiClient.send('GET', `articles/${created.slug}`);

    expect(res.status).toBe(200);
    expectContract('GET /api/articles/{slug}', res, { source: 'openapi' });
    const { article } = bodyOf<ArticleBody>(res);
    expect(article.slug).toBe(created.slug);
    expect(article.body).toBe(created.body);
  });

  test('an unknown slug is a 404', async ({ apiClient }) => {
    const res = await apiClient.send('GET', `articles/${slugOf(buildArticle().title)}`);

    expect(res.status).toBe(404);
    expectContract('GET /api/articles/{slug}', res);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ article: ['not found'] });
  });
});

test.describe('updating an article', () => {
  test('the author can change a field, and the rest stays as it was', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const author = await userFactory();
    const created = await articleFactory(author);

    const res = await apiClient.send('PUT', `articles/${created.slug}`, {
      token: author.token,
      data: { article: { description: 'a new description' } },
    });

    expect(res.status).toBe(200);
    expectContract('PUT /api/articles/{slug}', res, { source: 'openapi' });
    const { article } = bodyOf<ArticleBody>(res);
    expect(article).toMatchObject({
      slug: created.slug,
      title: created.title,
      body: created.body,
      description: 'a new description',
    });
    const reread = await apiClient.send('GET', `articles/${created.slug}`);
    expect(bodyOf<ArticleBody>(reread).article.description).toBe('a new description');
  });

  test('changing the title changes the slug, and the old one is gone', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const author = await userFactory();
    const created = await articleFactory(author);
    const newTitle = buildArticle().title;

    const res = await apiClient.send('PUT', `articles/${created.slug}`, {
      token: author.token,
      data: { article: { title: newTitle } },
    });

    expect(res.status).toBe(200);
    expect(bodyOf<ArticleBody>(res).article.slug).toBe(slugOf(newTitle));
    expect((await apiClient.send('GET', `articles/${created.slug}`)).status).toBe(404);
    expect((await apiClient.send('GET', `articles/${slugOf(newTitle)}`)).status).toBe(200);
  });

  test("someone else's article is refused with 403 and left alone", async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const [author, other] = [await userFactory(), await userFactory()];
    const created = await articleFactory(author);

    const res = await apiClient.send('PUT', `articles/${created.slug}`, {
      token: other.token,
      data: { article: { description: 'hijacked' } },
    });

    expect(res.status).toBe(403);
    expectContract('PUT /api/articles/{slug}', res);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ article: ['forbidden'] });
    const reread = await apiClient.send('GET', `articles/${created.slug}`);
    expect(bodyOf<ArticleBody>(reread).article.description).toBe(created.description);
  });

  test('needs a token, and an unknown slug is a 404', async ({ apiClient, userFactory }) => {
    const user = await userFactory();
    const slug = slugOf(buildArticle().title);

    const anonymous = await apiClient.send('PUT', `articles/${slug}`, {
      data: { article: { description: 'x' } },
    });
    const unknown = await apiClient.send('PUT', `articles/${slug}`, {
      token: user.token,
      data: { article: { description: 'x' } },
    });

    expect(anonymous.status).toBe(401);
    expect(unknown.status).toBe(404);
  });
});

test.describe('deleting an article', () => {
  test('the author deletes it with a 204, and it is gone', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const author = await userFactory();
    const created = await articleFactory(author);

    const res = await apiClient.send('DELETE', `articles/${created.slug}`, { token: author.token });

    expect(res.status).toBe(204);
    expectContract('DELETE /api/articles/{slug}', res, { source: 'supplement' });
    expect((await apiClient.send('GET', `articles/${created.slug}`)).status).toBe(404);
  });

  test("someone else's article is refused with 403 and kept", async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const [author, other] = [await userFactory(), await userFactory()];
    const created = await articleFactory(author);

    const res = await apiClient.send('DELETE', `articles/${created.slug}`, { token: other.token });

    expect(res.status).toBe(403);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ article: ['forbidden'] });
    expect((await apiClient.send('GET', `articles/${created.slug}`)).status).toBe(200);
  });

  test('needs a token, and an unknown slug is a 404', async ({ apiClient, userFactory }) => {
    const user = await userFactory();
    const slug = slugOf(buildArticle().title);

    const anonymous = await apiClient.send('DELETE', `articles/${slug}`);
    const unknown = await apiClient.send('DELETE', `articles/${slug}`, { token: user.token });

    expect(anonymous.status).toBe(401);
    expect(unknown.status).toBe(404);
    expectContract('DELETE /api/articles/{slug}', unknown);
  });
});

// Backend defects as observed on 2026-09-25 (docs/findings.md); each fails, on purpose, once fixed.
test.describe('known backend defects: articles', () => {
  test('the same tag twice in one request is a 500', async ({ apiClient, userFactory }) => {
    knownIssue('A duplicate tag in tagList crashes article creation with an unhandled 500.');
    const author = await userFactory();
    const tag = buildTag();

    const res = await apiClient.send('POST', 'articles', {
      token: author.token,
      data: { article: buildArticle({ tagList: [tag, tag] }) },
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ errors: 'InternalServerError' });
  });

  test('editing the tag list is a 500', async ({ apiClient, userFactory, articleFactory }) => {
    knownIssue('Updating an article with a tagList crashes with an unhandled 500.');
    const author = await userFactory();
    const created = await articleFactory(author, { tagList: [buildTag()] });

    const res = await apiClient.send('PUT', `articles/${created.slug}`, {
      token: author.token,
      data: { article: { tagList: [buildTag()] } },
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ errors: 'InternalServerError' });
  });

  test('a blank title on update is ignored, though on create it is a 422', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    knownIssue('Update silently ignores a blank title where create rejects one.');
    const author = await userFactory();
    const created = await articleFactory(author);

    const res = await apiClient.send('PUT', `articles/${created.slug}`, {
      token: author.token,
      data: { article: { title: '' } },
    });

    expect(res.status).toBe(200);
    expect(bodyOf<ArticleBody>(res).article.title).toBe(created.title);
  });
});
