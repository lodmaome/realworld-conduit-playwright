import { test, expect } from '../fixtures/base';
import { afterAppHandled, recordRequests, requestEnded } from '../support/app-settled';
import { apiErrors, type ApiOverride } from '../support/api-mock';
import {
  anna,
  articles,
  dragonArticle,
  signedInUser,
  testingArticle,
} from '../support/sample-data';

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

test.describe('favorited posts tab (mocked API)', () => {
  // The stub layer doesn't filter by `favorited`, so the tab's list comes from an override.
  const favoritedBy = (shown: typeof articles): ApiOverride => ({
    path: '/articles',
    query: { favorited: anna.username },
    status: 200,
    body: { articles: shown, articlesCount: shown.length },
  });

  test("asks for the user's favorites and shows them instead of their own posts", async ({
    page,
    profilePage,
    mockApi,
  }) => {
    await mockApi({
      user: signedInUser,
      articles,
      profiles: [anna],
      overrides: [favoritedBy([testingArticle])],
    });
    const listRequests = recordRequests(page, 'GET', '/api/articles');

    await profilePage.goto(anna.username);
    await expect(profilePage.articles.preview(dragonArticle.title)).toBeVisible();
    await profilePage.favoritedPostsTab.click();

    await expect(page).toHaveURL(`/profile/${anna.username}/favorites`);
    await expect(profilePage.articles.preview(testingArticle.title)).toBeVisible();
    await expect(profilePage.articles.preview(dragonArticle.title)).toHaveCount(0);
    const filters = listRequests.map((url) => new URL(url).searchParams);
    expect(filters.some((query) => query.get('favorited') === anna.username)).toBe(true);
  });

  test('shows the empty message when the user has favorited nothing', async ({
    profilePage,
    mockApi,
  }) => {
    await mockApi({
      user: signedInUser,
      articles,
      profiles: [anna],
      overrides: [favoritedBy([])],
    });

    await profilePage.gotoFavorites(anna.username);

    await expect(profilePage.articles.emptyMessage).toContainText('No articles are here');
    await expect(profilePage.articles.previews).toHaveCount(0);
  });

  // KNOWN FRONTEND GAP, pinned as observed on 2026-09-25: as elsewhere, a failed list
  // request leaves "Loading articles..." for good, with no error. Rewrite this if the
  // frontend gains an error state.
  test('a failed favorites request leaves the loading message and no error', async ({
    page,
    profilePage,
    mockApi,
  }) => {
    test.info().annotations.push({
      type: 'known-issue',
      description:
        "A failed request for a user's favorites leaves the list on the loading message.",
    });
    await mockApi({
      user: signedInUser,
      articles,
      profiles: [anna],
      overrides: [
        {
          path: '/articles',
          query: { favorited: anna.username },
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });

    const listEnded = requestEnded(page, '/api/articles');
    await profilePage.gotoFavorites(anna.username);
    await listEnded;
    await afterAppHandled(page);

    await expect(profilePage.articles.loadingMessage).toBeVisible();
    await expect(profilePage.articles.previews).toHaveCount(0);
    await expect(profilePage.errors).toHaveCount(0);
  });
});
