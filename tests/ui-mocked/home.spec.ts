import { test, expect } from '../fixtures/base';
import { afterAppHandled, requestEnded } from '../support/app-settled';
import { apiErrors, deferred, type ApiOverride } from '../support/api-mock';
import { articles, tags } from '../support/sample-data';

test.describe('home feed (mocked API)', () => {
  test('shows the loading message until the feed responds, then the articles', async ({
    homePage,
    mockApi,
  }) => {
    const feedResponse = deferred();
    await mockApi({
      tags,
      overrides: [
        {
          path: '/articles',
          status: 200,
          body: { articles, articlesCount: articles.length },
          until: feedResponse.promise,
        },
      ],
    });

    await homePage.goto();

    await expect(homePage.articles.loadingMessage).toBeVisible();
    await expect(homePage.articles.previews).toHaveCount(0);

    feedResponse.release();

    await expect(homePage.articles.previews).toHaveCount(articles.length);
    await expect(homePage.articles.loadingMessage).toBeHidden();
  });

  test('shows the empty message for a tag no article has', async ({ homePage, mockApi }) => {
    // `playwright` is a listed tag, but none of the stub articles carries it.
    await mockApi({ tags, articles });

    await homePage.gotoTag('playwright');

    await expect(homePage.articles.emptyMessage).toContainText('No articles are here');
    await expect(homePage.articles.previews).toHaveCount(0);
    await expect(homePage.articles.loadingMessage).toBeHidden();
  });

  // KNOWN FRONTEND GAP, pinned as observed on 2026-09-25: when the feed request fails, the
  // page has no error state. It stays on "Loading articles..." indefinitely, shows no error
  // and no articles. These tests assert that behaviour so a change is noticed; if the
  // frontend gains an error state they will fail, and should be rewritten to assert it.
  // See docs/adr/0013-api-overrides-for-the-mocked-ui-project.md.
  const feedFailures: Array<{ name: string; override: ApiOverride }> = [
    {
      name: 'the server errors (500)',
      override: {
        path: '/articles',
        status: 500,
        body: apiErrors({ server: ['Something went wrong'] }),
      },
    },
    { name: 'the connection drops', override: { path: '/articles', abort: true } },
  ];

  for (const { name, override } of feedFailures) {
    test(`stays on the loading message, with no error, when ${name}`, async ({
      page,
      homePage,
      mockApi,
    }) => {
      test.info().annotations.push({
        type: 'known-issue',
        description: 'The home feed has no error state; a failed request leaves it loading.',
      });
      await mockApi({ tags, overrides: [override] });

      const feedEnded = requestEnded(page, '/api/articles');
      await homePage.goto();
      await feedEnded;
      await afterAppHandled(page);

      await expect(homePage.articles.loadingMessage).toBeVisible();
      await expect(homePage.articles.previews).toHaveCount(0);
      await expect(page.locator('.error-messages')).toHaveCount(0);
    });
  }
});
