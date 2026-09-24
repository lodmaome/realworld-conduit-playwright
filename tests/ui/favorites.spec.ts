import { buildTag } from '@factories/article-factory';
import { test, expect } from '../fixtures/base';

test.describe('favorites', () => {
  test(
    'a signed-in user can favorite and unfavorite an article',
    { tag: '@smoke' },
    async ({ authenticatedPage, articlePage, userFactory, articleFactory }) => {
      const article = await articleFactory(await userFactory());

      await articlePage.goto(article.slug);
      await expect(authenticatedPage).toHaveURL(`/article/${article.slug}`);
      await expect(articlePage.favoritesCount).toHaveText('(0)');

      await articlePage.favoriteButton.click();
      await expect(articlePage.unfavoriteButton).toBeVisible();
      await expect(articlePage.favoritesCount).toHaveText('(1)');

      await articlePage.unfavoriteButton.click();
      await expect(articlePage.favoriteButton).toBeVisible();
      await expect(articlePage.favoritesCount).toHaveText('(0)');
    },
  );

  test('favoriting from the feed updates the count on the article preview', async ({
    authenticatedPage,
    homePage,
    userFactory,
    articleFactory,
  }) => {
    const tag = buildTag();
    const article = await articleFactory(await userFactory(), { tagList: [tag] });

    await homePage.gotoTag(tag);
    await expect(authenticatedPage).toHaveURL(`/tag/${tag}`);
    const favorite = homePage.articles.favoriteButton(article.title);
    await expect(favorite).toHaveText('0');

    await favorite.click();

    await expect(favorite).toHaveText('1');
  });

  test('a favorited article shows up under Favorited Posts on the profile, not My Posts', async ({
    authenticatedPage,
    authenticatedUser,
    articlePage,
    profilePage,
    userFactory,
    articleFactory,
  }) => {
    const article = await articleFactory(await userFactory());
    await articlePage.goto(article.slug);
    await articlePage.favoriteButton.click();
    await expect(articlePage.unfavoriteButton).toBeVisible();

    await profilePage.goto(authenticatedUser.username);
    await expect(authenticatedPage).toHaveURL(`/profile/${authenticatedUser.username}`);
    await expect(profilePage.articles.emptyMessage).toBeVisible();

    await profilePage.favoritedPostsTab.click();

    await expect(authenticatedPage).toHaveURL(`/profile/${authenticatedUser.username}/favorites`);
    await expect(profilePage.articles.preview(article.title)).toBeVisible();
  });

  test('an anonymous visitor who tries to favorite is sent to sign up', async ({
    page,
    articlePage,
    userFactory,
    articleFactory,
  }) => {
    const article = await articleFactory(await userFactory());

    await articlePage.goto(article.slug);
    await articlePage.favoriteButton.click();

    await expect(page).toHaveURL('/register');
  });
});
