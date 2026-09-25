import { test, expect } from '../fixtures/base';
import { afterAppHandled, requestEnded } from '../support/app-settled';
import { apiErrors, type ApiOverride } from '../support/api-mock';
import { anna, articles, signedInUser } from '../support/sample-data';

test.describe('profile (mocked API)', () => {
  test('a user with no articles shows the empty message', async ({ profilePage, mockApi }) => {
    await mockApi({ user: signedInUser, articles: [], profiles: [anna] });

    await profilePage.goto(anna.username);

    await expect(profilePage.username).toHaveText(anna.username);
    await expect(profilePage.articles.emptyMessage).toContainText('No articles are here');
    await expect(profilePage.articles.previews).toHaveCount(0);
  });

  // KNOWN FRONTEND GAP, pinned as observed on 2026-09-25: whether the profile is missing
  // (404) or the server fails (500), the page is blank: no user, no articles, no error. The
  // real-backend test of a missing profile (tests/ui/profile.spec.ts) is titled "shows an
  // error" but only asserts the username is hidden, so it doesn't catch this. Rewrite these
  // if the frontend gains an error state.
  const profileFailures: Array<{ name: string; override?: ApiOverride }> = [
    { name: 'the profile does not exist (404)' },
    {
      name: 'the server errors (500)',
      override: {
        path: `/profiles/${anna.username}`,
        status: 500,
        body: apiErrors({ server: ['Something went wrong'] }),
      },
    },
  ];

  for (const { name, override } of profileFailures) {
    test(`renders a blank page, with no error, when ${name}`, async ({
      page,
      profilePage,
      mockApi,
    }) => {
      test.info().annotations.push({
        type: 'known-issue',
        description: 'A profile that fails to load renders a blank page with no message.',
      });
      // No profile is stubbed, so without an override the stub layer answers 404.
      await mockApi({ user: signedInUser, articles, overrides: override ? [override] : [] });

      const profileEnded = requestEnded(page, `/api/profiles/${anna.username}`);
      await profilePage.goto(anna.username);
      await profileEnded;
      await afterAppHandled(page);

      await expect(profilePage.username).toHaveCount(0);
      await expect(profilePage.articles.previews).toHaveCount(0);
      await expect(profilePage.errors).toHaveCount(0);
    });
  }

  // KNOWN FRONTEND GAP, pinned as observed on 2026-09-25: when following fails the button
  // is left as it was, which is right, but nothing tells the user it didn't work.
  test('a failed follow leaves the button on Follow and shows no error', async ({
    page,
    profilePage,
    mockApi,
  }) => {
    test.info().annotations.push({
      type: 'known-issue',
      description: 'A failed follow request is not reported to the user.',
    });
    await mockApi({
      user: signedInUser,
      articles,
      profiles: [anna],
      overrides: [
        {
          method: 'POST',
          path: `/profiles/${anna.username}/follow`,
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });

    await profilePage.goto(anna.username);
    await expect(profilePage.followButton(anna.username)).toBeVisible();
    const followEnded = requestEnded(page, `/api/profiles/${anna.username}/follow`);
    await profilePage.followButton(anna.username).click();
    await followEnded;
    await afterAppHandled(page);

    await expect(profilePage.followButton(anna.username)).toBeVisible();
    await expect(profilePage.unfollowButton(anna.username)).toHaveCount(0);
    await expect(profilePage.errors).toHaveCount(0);
  });
});
