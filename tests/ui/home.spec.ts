import { buildTag } from '@factories/article-factory';
import { test, expect } from '../fixtures/base';

test.describe('global feed', () => {
  test(
    'an anonymous visitor can see a published article in the feed and open it',
    { tag: '@smoke' },
    async ({ page, homePage, articlePage, userFactory, articleFactory }) => {
      const tag = buildTag();
      const article = await articleFactory(await userFactory(), { tagList: [tag] });

      await homePage.gotoTag(tag);

      await expect(homePage.articles.previews).toHaveCount(1);
      await expect(homePage.articles.preview(article.title)).toContainText(article.description);
      await expect(homePage.activeFeedTab).toContainText(tag);

      await homePage.articles.open(article.title);

      await expect(page).toHaveURL(`/article/${article.slug}`);
      await expect(articlePage.title).toHaveText(article.title);
    },
  );

  test('clicking a popular tag filters the feed to that tag', async ({
    page,
    homePage,
    userFactory,
    articleFactory,
  }) => {
    const tag = buildTag();
    const article = await articleFactory(await userFactory(), { tagList: [tag] });

    await homePage.goto();
    await homePage.tag(tag).click();

    await expect(page).toHaveURL(`/tag/${tag}`);
    await expect(homePage.articles.preview(article.title)).toBeVisible();
    await expect(homePage.articles.previews).toHaveCount(1);
  });

  test('a tag with no articles shows the empty-feed message', async ({ homePage }) => {
    await homePage.gotoTag(buildTag());

    await expect(homePage.articles.emptyMessage).toContainText('No articles are here');
  });

  test('the feed is paginated ten articles at a time', async ({
    page,
    homePage,
    userFactory,
    articleFactory,
  }) => {
    const tag = buildTag();
    const author = await userFactory();
    await Promise.all(Array.from({ length: 11 }, () => articleFactory(author, { tagList: [tag] })));

    await homePage.gotoTag(tag);
    await expect(homePage.articles.previews).toHaveCount(10);
    await expect(homePage.articles.pagination.getByRole('button')).toHaveCount(2);

    await homePage.articles.paginationButton(2).click();

    await expect(page).toHaveURL(/page=2/);
    await expect(homePage.articles.previews).toHaveCount(1);
  });
});

test.describe('your feed', () => {
  test('shows articles from authors the user follows', async ({
    authenticatedPage,
    homePage,
    articlePage,
    userFactory,
    articleFactory,
  }) => {
    const author = await userFactory();
    const article = await articleFactory(author);

    await articlePage.goto(article.slug);
    await articlePage.followButton(author.username).click();
    await expect(articlePage.unfollowButton(author.username)).toBeVisible();

    await homePage.goto();
    await homePage.yourFeedTab.click();

    await expect(authenticatedPage).toHaveURL('/?feed=following');
    await expect(homePage.articles.preview(article.title)).toBeVisible();
  });

  test('is empty for a user who follows nobody', async ({ homePage, authenticatedPage }) => {
    await homePage.gotoFollowingFeed();

    await expect(authenticatedPage).toHaveURL('/?feed=following');
    await expect(homePage.articles.emptyMessage).toContainText('Your feed is empty');
  });

  test('sends an anonymous visitor to the login page', async ({ page, homePage }) => {
    await homePage.gotoFollowingFeed();

    await expect(page).toHaveURL('/login');
  });
});
