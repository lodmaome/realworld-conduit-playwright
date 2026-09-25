import { buildArticle } from '@factories/article-factory';
import { expect, test } from '../fixtures/base';
import {
  bodyOf,
  slugOf,
  type CommentBody,
  type CommentsBody,
  type ErrorBody,
} from '../support/api-shapes';
import { expectContract } from '../support/contract';

test.describe('adding a comment', () => {
  test('returns 201 with the comment, its id, and its author', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const [author, commenter] = [await userFactory(), await userFactory()];
    const article = await articleFactory(author);

    const res = await apiClient.send('POST', `articles/${article.slug}/comments`, {
      token: commenter.token,
      data: { comment: { body: 'a thoughtful reply' } },
    });

    expect(res.status).toBe(201);
    expectContract('POST /api/articles/{slug}/comments', res, { source: 'supplement' });
    const { comment } = bodyOf<CommentBody>(res);
    expect(comment.body).toBe('a thoughtful reply');
    expect(comment.author.username).toBe(commenter.username);
    expect(comment.id).toBeGreaterThan(0);
  });

  test('needs a token', async ({ apiClient, userFactory, articleFactory }) => {
    const article = await articleFactory(await userFactory());

    const res = await apiClient.send('POST', `articles/${article.slug}/comments`, {
      data: { comment: { body: 'x' } },
    });

    expect(res.status).toBe(401);
    expectContract('POST /api/articles/{slug}/comments', res);
  });

  test('refuses an empty body with 422', async ({ apiClient, userFactory, articleFactory }) => {
    const user = await userFactory();
    const article = await articleFactory(user);

    const res = await apiClient.send('POST', `articles/${article.slug}/comments`, {
      token: user.token,
      data: { comment: { body: '' } },
    });

    expect(res.status).toBe(422);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ body: ["can't be blank"] });
  });

  test('an article that does not exist is a 404', async ({ apiClient, userFactory }) => {
    const user = await userFactory();

    const res = await apiClient.send('POST', `articles/${slugOf(buildArticle().title)}/comments`, {
      token: user.token,
      data: { comment: { body: 'x' } },
    });

    expect(res.status).toBe(404);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ article: ['not found'] });
  });
});

test.describe('reading comments', () => {
  test('anyone can list them, oldest first', async ({ apiClient, userFactory, articleFactory }) => {
    const [author, commenter] = [await userFactory(), await userFactory()];
    const article = await articleFactory(author);
    for (const body of ['first', 'second', 'third']) {
      await apiClient.send('POST', `articles/${article.slug}/comments`, {
        token: commenter.token,
        data: { comment: { body } },
      });
    }

    const res = await apiClient.send('GET', `articles/${article.slug}/comments`);

    expect(res.status).toBe(200);
    expectContract('GET /api/articles/{slug}/comments', res, { source: 'openapi' });
    expect(bodyOf<CommentsBody>(res).comments.map((c) => c.body)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  test('an article with none has an empty list', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const article = await articleFactory(await userFactory());

    const res = await apiClient.send('GET', `articles/${article.slug}/comments`);

    expect(bodyOf<CommentsBody>(res)).toEqual({ comments: [] });
  });

  test('an article that does not exist is a 404', async ({ apiClient }) => {
    const res = await apiClient.send('GET', `articles/${slugOf(buildArticle().title)}/comments`);

    expect(res.status).toBe(404);
    expectContract('GET /api/articles/{slug}/comments', res);
  });
});

test.describe('deleting a comment', () => {
  const addComment = async (
    apiClient: import('@api-client/client').ApiClient,
    slug: string,
    token: string,
  ) =>
    bodyOf<CommentBody>(
      await apiClient.send('POST', `articles/${slug}/comments`, {
        token,
        data: { comment: { body: 'to be judged' } },
      }),
    ).comment.id;

  test('its author deletes it with a 204, and it is gone', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const [author, commenter] = [await userFactory(), await userFactory()];
    const article = await articleFactory(author);
    const id = await addComment(apiClient, article.slug, commenter.token);

    const res = await apiClient.send('DELETE', `articles/${article.slug}/comments/${id}`, {
      token: commenter.token,
    });

    expect(res.status).toBe(204);
    expectContract('DELETE /api/articles/{slug}/comments/{id}', res, { source: 'supplement' });
    const remaining = await apiClient.send('GET', `articles/${article.slug}/comments`);
    expect(bodyOf<CommentsBody>(remaining).comments).toEqual([]);
  });

  test("someone else's comment is refused with 403, even by the article's author", async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const [author, commenter] = [await userFactory(), await userFactory()];
    const article = await articleFactory(author);
    const id = await addComment(apiClient, article.slug, commenter.token);

    const res = await apiClient.send('DELETE', `articles/${article.slug}/comments/${id}`, {
      token: author.token,
    });

    expect(res.status).toBe(403);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ comment: ['forbidden'] });
    const remaining = await apiClient.send('GET', `articles/${article.slug}/comments`);
    expect(bodyOf<CommentsBody>(remaining).comments).toHaveLength(1);
  });

  test('needs a token, and an unknown comment is a 404', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const user = await userFactory();
    const article = await articleFactory(user);
    const id = await addComment(apiClient, article.slug, user.token);

    const anonymous = await apiClient.send('DELETE', `articles/${article.slug}/comments/${id}`);
    const unknown = await apiClient.send('DELETE', `articles/${article.slug}/comments/999999999`, {
      token: user.token,
    });

    expect(anonymous.status).toBe(401);
    expect(unknown.status).toBe(404);
    expect(bodyOf<ErrorBody>(unknown).errors).toEqual({ comment: ['not found'] });
  });

  test('deleting an article takes its comments with it', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const author = await userFactory();
    const article = await articleFactory(author);
    await addComment(apiClient, article.slug, author.token);

    await apiClient.send('DELETE', `articles/${article.slug}`, { token: author.token });
    const res = await apiClient.send('GET', `articles/${article.slug}/comments`);

    expect(res.status).toBe(404);
  });
});
