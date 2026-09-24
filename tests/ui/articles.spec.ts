import { buildArticle, buildTag } from '@factories/article-factory';
import { test, expect } from '../fixtures/base';

test.describe('publishing', () => {
  test(
    'a signed-in user can publish an article and see it rendered',
    { tag: '@smoke' },
    async ({ authenticatedPage, editorPage, articlePage, authenticatedUser }) => {
      const article = buildArticle({ body: 'Some **bold** words', tagList: ['alpha', 'beta'] });

      await editorPage.goto();
      await editorPage.fillArticle(article);
      await editorPage.publish();

      await expect(authenticatedPage).toHaveURL(/\/article\/[^/]+$/);
      await expect(articlePage.title).toHaveText(article.title);
      await expect(articlePage.author).toHaveText(authenticatedUser.username);
      await expect(articlePage.body.locator('strong')).toHaveText('bold');
      await expect(articlePage.tags).toHaveText(['alpha', 'beta']);
    },
  );

  test('publishing without a title shows a validation error and stays in the editor', async ({
    authenticatedPage,
    editorPage,
  }) => {
    await editorPage.goto();
    await editorPage.fillArticle({ ...buildArticle(), title: '' });
    await editorPage.publish();

    await expect(editorPage.errors).toBeVisible();
    await expect(authenticatedPage).toHaveURL('/editor');
  });

  test('an added tag can be removed again before publishing', async ({
    authenticatedPage,
    editorPage,
  }) => {
    await editorPage.goto();
    await expect(authenticatedPage).toHaveURL('/editor');
    await editorPage.tagInput.fill('temporary');
    await editorPage.tagInput.press('Enter');
    await expect(editorPage.tags).toHaveText(['temporary']);

    await editorPage.removeTag('temporary');

    await expect(editorPage.tags).toHaveCount(0);
  });
});

test.describe('editing and deleting', () => {
  test('the author can edit their article', async ({
    authenticatedPage,
    authenticatedUser,
    articleFactory,
    articlePage,
    editorPage,
  }) => {
    const original = await articleFactory(authenticatedUser);
    const newTitle = `${original.title} (edited)`;

    await articlePage.goto(original.slug);
    await articlePage.editLink.click();
    await expect(authenticatedPage).toHaveURL(`/editor/${original.slug}`);
    await expect(editorPage.titleInput).toHaveValue(original.title);

    await editorPage.titleInput.fill(newTitle);
    await editorPage.publish();

    await expect(articlePage.title).toHaveText(newTitle);
  });

  test('the author can delete their article', async ({
    authenticatedPage,
    authenticatedUser,
    articleFactory,
    articlePage,
    homePage,
  }) => {
    const tag = buildTag();
    const article = await articleFactory(authenticatedUser, { tagList: [tag] });

    await articlePage.goto(article.slug);
    await articlePage.deleteButton.click();

    await expect(authenticatedPage).toHaveURL('/');
    await homePage.gotoTag(tag);
    await expect(homePage.articles.emptyMessage).toBeVisible();
  });

  test('a reader who is not the author sees no edit or delete controls', async ({
    authenticatedPage,
    userFactory,
    articleFactory,
    articlePage,
  }) => {
    const author = await userFactory();
    const article = await articleFactory(author);

    await articlePage.goto(article.slug);

    await expect(authenticatedPage).toHaveURL(`/article/${article.slug}`);
    await expect(articlePage.title).toHaveText(article.title);
    await expect(articlePage.editLink).toBeHidden();
    await expect(articlePage.deleteButton).toBeHidden();
  });
});
