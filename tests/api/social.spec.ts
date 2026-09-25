import { buildArticle } from '@factories/article-factory';
import { buildUser } from '@factories/user-factory';
import { expect, test } from '../fixtures/base';
import {
  bodyOf,
  knownIssue,
  slugOf,
  type ArticleBody,
  type ArticlesBody,
  type ErrorBody,
  type ProfileBody,
} from '../support/api-shapes';
import { expectContract } from '../support/contract';

test.describe('favorites', () => {
  test('favoriting marks the article and counts it', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const [author, fan] = [await userFactory(), await userFactory()];
    const article = await articleFactory(author);

    const res = await apiClient.send('POST', `articles/${article.slug}/favorite`, {
      token: fan.token,
    });

    expect(res.status).toBe(200);
    expectContract('POST /api/articles/{slug}/favorite', res, { source: 'openapi' });
    expect(bodyOf<ArticleBody>(res).article).toMatchObject({ favorited: true, favoritesCount: 1 });
  });

  test('favoriting twice counts once', async ({ apiClient, userFactory, articleFactory }) => {
    const [author, fan] = [await userFactory(), await userFactory()];
    const article = await articleFactory(author);
    const favorite = () =>
      apiClient.send('POST', `articles/${article.slug}/favorite`, { token: fan.token });

    await favorite();
    const again = await favorite();

    expect(again.status).toBe(200);
    expect(bodyOf<ArticleBody>(again).article.favoritesCount).toBe(1);
  });

  test('two fans count twice, and each unfavorite takes one off', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const [author, fanA, fanB] = [await userFactory(), await userFactory(), await userFactory()];
    const article = await articleFactory(author);
    for (const fan of [fanA, fanB]) {
      await apiClient.send('POST', `articles/${article.slug}/favorite`, { token: fan.token });
    }

    const afterOne = await apiClient.send('DELETE', `articles/${article.slug}/favorite`, {
      token: fanA.token,
    });

    expect(afterOne.status).toBe(200);
    expectContract('DELETE /api/articles/{slug}/favorite', afterOne, { source: 'openapi' });
    expect(bodyOf<ArticleBody>(afterOne).article.favoritesCount).toBe(1);
  });

  test('unfavoriting something never favorited changes nothing', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    const [author, other] = [await userFactory(), await userFactory()];
    const article = await articleFactory(author);

    const res = await apiClient.send('DELETE', `articles/${article.slug}/favorite`, {
      token: other.token,
    });

    expect(res.status).toBe(200);
    expect(bodyOf<ArticleBody>(res).article).toMatchObject({ favorited: false, favoritesCount: 0 });
  });

  test('needs a token, and an unknown article is a 404', async ({ apiClient, userFactory }) => {
    const user = await userFactory();
    const slug = slugOf(buildArticle().title);

    const anonymous = await apiClient.send('POST', `articles/${slug}/favorite`);
    const unknown = await apiClient.send('POST', `articles/${slug}/favorite`, {
      token: user.token,
    });

    expect(anonymous.status).toBe(401);
    expect(unknown.status).toBe(404);
    expect(bodyOf<ErrorBody>(unknown).errors).toEqual({ article: ['not found'] });
  });
});

test.describe('following', () => {
  test('following makes the profile read as followed, for the follower only', async ({
    apiClient,
    userFactory,
  }) => {
    const [follower, target, bystander] = [
      await userFactory(),
      await userFactory(),
      await userFactory(),
    ];

    const res = await apiClient.send('POST', `profiles/${target.username}/follow`, {
      token: follower.token,
    });

    expect(res.status).toBe(200);
    expectContract('POST /api/profiles/{username}/follow', res, { source: 'openapi' });
    expect(bodyOf<ProfileBody>(res).profile).toMatchObject({
      username: target.username,
      following: true,
    });
    const read = async (token?: string) =>
      bodyOf<ProfileBody>(await apiClient.send('GET', `profiles/${target.username}`, { token }))
        .profile.following;
    expect(await read(follower.token)).toBe(true);
    expect(await read(bystander.token)).toBe(false);
    expect(await read()).toBe(false);
  });

  test('following twice, and unfollowing twice, are both harmless', async ({
    apiClient,
    userFactory,
  }) => {
    const [follower, target] = [await userFactory(), await userFactory()];
    const send = (method: 'POST' | 'DELETE') =>
      apiClient.send(method, `profiles/${target.username}/follow`, { token: follower.token });

    const followedTwice = [await send('POST'), await send('POST')];
    const unfollowedTwice = [await send('DELETE'), await send('DELETE')];

    expect(followedTwice.map((r) => bodyOf<ProfileBody>(r).profile.following)).toEqual([
      true,
      true,
    ]);
    expectContract('DELETE /api/profiles/{username}/follow', unfollowedTwice[0]!, {
      source: 'openapi',
    });
    expect(unfollowedTwice.map((r) => bodyOf<ProfileBody>(r).profile.following)).toEqual([
      false,
      false,
    ]);
  });

  test('needs a token, and an unknown profile is a 404', async ({ apiClient, userFactory }) => {
    const [follower, target] = [await userFactory(), await userFactory()];

    const anonymous = await apiClient.send('POST', `profiles/${target.username}/follow`);
    const unknown = await apiClient.send('POST', `profiles/nobody-${target.username}/follow`, {
      token: follower.token,
    });

    expect(anonymous.status).toBe(401);
    expect(unknown.status).toBe(404);
    expect(bodyOf<ErrorBody>(unknown).errors).toEqual({ profile: ['not found'] });
  });
});

test.describe('profiles', () => {
  test('anyone can read one, with the bio the user set', async ({ apiClient, userFactory }) => {
    const user = await userFactory();
    await apiClient.send('PUT', 'user', { token: user.token, data: { user: { bio: 'hello' } } });

    const res = await apiClient.send('GET', `profiles/${user.username}`);

    expect(res.status).toBe(200);
    expectContract('GET /api/profiles/{username}', res, { source: 'openapi' });
    expect(bodyOf<ProfileBody>(res).profile).toEqual({
      username: user.username,
      bio: 'hello',
      image: null,
      following: false,
    });
  });

  test('an unknown profile is a 404', async ({ apiClient }) => {
    const res = await apiClient.send('GET', `profiles/nobody-${buildUser().username}`);

    expect(res.status).toBe(404);
    expectContract('GET /api/profiles/{username}', res);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ profile: ['not found'] });
  });
});

// Backend defects as observed on 2026-09-25 (docs/findings.md); each fails, on purpose, once fixed.
test.describe('known backend defects: social', () => {
  test('a user can follow themselves', async ({ apiClient, userFactory }) => {
    knownIssue('Following your own profile is allowed.');
    const user = await userFactory();

    const res = await apiClient.send('POST', `profiles/${user.username}/follow`, {
      token: user.token,
    });

    expect(res.status).toBe(200);
    expect(bodyOf<ProfileBody>(res).profile.following).toBe(true);
  });

  test('"favorited" is true for everyone once anyone has favorited the article', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    knownIssue('The favorited flag reflects whether anyone favorited, not the viewer.');
    const [author, fan, bystander] = [
      await userFactory(),
      await userFactory(),
      await userFactory(),
    ];
    const article = await articleFactory(author);
    await apiClient.send('POST', `articles/${article.slug}/favorite`, { token: fan.token });
    const seenBy = async (token?: string) =>
      bodyOf<ArticleBody>(await apiClient.send('GET', `articles/${article.slug}`, { token }))
        .article.favorited;

    // Only the fan should see true. All of them do.
    expect(await seenBy(fan.token)).toBe(true);
    expect(await seenBy(bystander.token)).toBe(true);
    expect(await seenBy(author.token)).toBe(true);
    expect(await seenBy()).toBe(true);
  });

  test('a single article says its author is not followed, though the list and the profile say so', async ({
    apiClient,
    userFactory,
    articleFactory,
  }) => {
    knownIssue('author.following is always false on GET /articles/{slug}.');
    const [author, follower] = [await userFactory(), await userFactory()];
    const article = await articleFactory(author);
    await apiClient.send('POST', `profiles/${author.username}/follow`, { token: follower.token });

    const single = await apiClient.send('GET', `articles/${article.slug}`, {
      token: follower.token,
    });
    const listed = await apiClient.send('GET', 'articles', {
      token: follower.token,
      params: { author: author.username },
    });
    const profile = await apiClient.send('GET', `profiles/${author.username}`, {
      token: follower.token,
    });

    expect(bodyOf<ProfileBody>(profile).profile.following).toBe(true);
    expect(bodyOf<ArticlesBody>(listed).articles[0]?.author.following).toBe(true);
    // The disagreement: the same author, the same viewer.
    expect(bodyOf<ArticleBody>(single).article.author.following).toBe(false);
  });
});
