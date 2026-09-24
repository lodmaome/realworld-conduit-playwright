import { test, expect } from '../fixtures/base';

test.describe('profile', () => {
  test('shows the user and their own articles, with a link to edit their settings', async ({
    authenticatedPage,
    authenticatedUser,
    profilePage,
    articleFactory,
  }) => {
    const article = await articleFactory(authenticatedUser);

    await profilePage.goto(authenticatedUser.username);

    await expect(authenticatedPage).toHaveURL(`/profile/${authenticatedUser.username}`);
    await expect(profilePage.username).toHaveText(authenticatedUser.username);
    await expect(profilePage.articles.preview(article.title)).toBeVisible();
    await expect(profilePage.editProfileLink).toBeVisible();
    await expect(profilePage.followButton(authenticatedUser.username)).toBeHidden();
  });

  test(
    "a signed-in user can follow and unfollow another user from that user's profile",
    { tag: '@smoke' },
    async ({ authenticatedPage, profilePage, userFactory }) => {
      const other = await userFactory();

      await profilePage.goto(other.username);
      await expect(authenticatedPage).toHaveURL(`/profile/${other.username}`);
      await expect(profilePage.editProfileLink).toBeHidden();

      await profilePage.followButton(other.username).click();
      await expect(profilePage.unfollowButton(other.username)).toBeVisible();

      await authenticatedPage.reload();
      await expect(profilePage.unfollowButton(other.username)).toBeVisible();

      await profilePage.unfollowButton(other.username).click();
      await expect(profilePage.followButton(other.username)).toBeVisible();
    },
  );

  test('an anonymous visitor who tries to follow is sent to sign in', async ({
    page,
    profilePage,
    userFactory,
  }) => {
    const other = await userFactory();

    await profilePage.goto(other.username);
    await profilePage.followButton(other.username).click();

    await expect(page).toHaveURL('/login');
  });

  test('a profile that does not exist shows an error', async ({ profilePage }) => {
    await profilePage.goto('nobody-by-this-name-exists');

    await expect(profilePage.username).toBeHidden();
  });
});
