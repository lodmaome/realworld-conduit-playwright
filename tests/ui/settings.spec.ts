import { faker } from '@faker-js/faker';
import { buildUser } from '@factories/user-factory';
import { test, expect } from '../fixtures/base';

test.describe('settings', () => {
  test('the form is pre-filled with the current user', async ({
    authenticatedPage,
    authenticatedUser,
    settingsPage,
  }) => {
    await settingsPage.goto();

    await expect(authenticatedPage).toHaveURL('/settings');
    await expect(settingsPage.usernameInput).toHaveValue(authenticatedUser.username);
    await expect(settingsPage.emailInput).toHaveValue(authenticatedUser.email);
  });

  test(
    'updating the bio is reflected on the public profile',
    { tag: '@smoke' },
    async ({ authenticatedPage, authenticatedUser, settingsPage, profilePage }) => {
      const bio = faker.lorem.sentence();

      await settingsPage.goto();
      await settingsPage.update({ bio });

      await expect(authenticatedPage).toHaveURL(`/profile/${authenticatedUser.username}`);
      await expect(profilePage.bio).toHaveText(bio);
    },
  );

  test('changing the username updates the header', async ({
    authenticatedPage,
    authenticatedUser,
    settingsPage,
    header,
  }) => {
    const { username } = buildUser();

    await settingsPage.goto();
    await settingsPage.update({ username });

    await expect(authenticatedPage).toHaveURL(`/profile/${username}`);
    await expect(header.profileLink(username)).toBeVisible();
    await expect(header.profileLink(authenticatedUser.username)).toBeHidden();
  });

  test('changing the email to one that is already taken shows an error', async ({
    authenticatedPage,
    settingsPage,
    userFactory,
  }) => {
    const other = await userFactory();

    await settingsPage.goto();
    await settingsPage.update({ email: other.email });

    await expect(settingsPage.errors).toBeVisible();
    await expect(authenticatedPage).toHaveURL('/settings');
  });

  test('logging out returns to the signed-out state and locks protected pages', async ({
    authenticatedPage,
    settingsPage,
    header,
  }) => {
    await settingsPage.goto();
    await settingsPage.logoutButton.click();

    await expect(authenticatedPage).toHaveURL('/');
    await expect(header.signInLink).toBeVisible();

    await settingsPage.goto();
    await expect(authenticatedPage).toHaveURL('/login');
  });
});
