import { faker } from '@faker-js/faker';
import { test, expect } from '../fixtures/base';

test.describe('comments', () => {
  test(
    'a signed-in user can comment on an article',
    { tag: '@smoke' },
    async ({ authenticatedPage, authenticatedUser, articlePage, userFactory, articleFactory }) => {
      const article = await articleFactory(await userFactory());
      const text = faker.lorem.sentence();

      await articlePage.goto(article.slug);
      await articlePage.addComment(text);

      await expect(authenticatedPage).toHaveURL(`/article/${article.slug}`);
      await expect(articlePage.comments).toHaveCount(1);
      await expect(articlePage.comment(text)).toContainText(authenticatedUser.username);
      await expect(articlePage.commentInput).toBeEmpty();
    },
  );

  test('a user can delete their own comment', async ({
    authenticatedPage,
    articlePage,
    userFactory,
    articleFactory,
  }) => {
    const article = await articleFactory(await userFactory());
    const text = faker.lorem.sentence();

    await articlePage.goto(article.slug);
    await articlePage.addComment(text);
    await expect(articlePage.comment(text)).toBeVisible();

    await articlePage.deleteComment(text);

    await expect(articlePage.comments).toHaveCount(0);
    await expect(authenticatedPage).toHaveURL(`/article/${article.slug}`);
  });

  test("a user cannot delete someone else's comment", async ({
    authenticatedPage,
    apiClient,
    articlePage,
    userFactory,
    articleFactory,
  }) => {
    const author = await userFactory();
    const article = await articleFactory(author);
    const text = faker.lorem.sentence();
    await apiClient.addComment(author.token, article.slug, text);

    await articlePage.goto(article.slug);

    await expect(authenticatedPage).toHaveURL(`/article/${article.slug}`);
    await expect(articlePage.comment(text)).toBeVisible();
    await expect(articlePage.comment(text).locator('.mod-options')).toBeHidden();
  });

  test('an anonymous visitor sees existing comments but is asked to sign in to add one', async ({
    apiClient,
    articlePage,
    userFactory,
    articleFactory,
  }) => {
    const author = await userFactory();
    const article = await articleFactory(author);
    const text = faker.lorem.sentence();
    await apiClient.addComment(author.token, article.slug, text);

    await articlePage.goto(article.slug);

    await expect(articlePage.comment(text)).toBeVisible();
    await expect(articlePage.commentSignInPrompt).toBeVisible();
    await expect(articlePage.commentInput).toBeHidden();
  });
});
