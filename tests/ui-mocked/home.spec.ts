import { test, expect } from '../fixtures/base';
import { afterAppHandled, requestEnded } from '../support/app-settled';
import { apiErrors, deferred, type ApiOverride } from '../support/api-mock';
import { articles, articleSeries, dragonArticle, signedInUser, tags } from '../support/sample-data';

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

test.describe('feed pagination (mocked API)', () => {
  const pageSize = 10;
  // Where a page count changes: the last full page, and one article past it. Ten articles
  // is one page, not two; eleven is two; twenty is still two; twenty-one is three.
  const boundaries: Array<{ count: number; pages: string[] }> = [
    { count: 10, pages: ['1'] },
    { count: 11, pages: ['1', '2'] },
    { count: 20, pages: ['1', '2'] },
    { count: 21, pages: ['1', '2', '3'] },
  ];

  for (const { count, pages } of boundaries) {
    test(`${count} articles are ${pages.length} page(s) of ${pageSize}`, async ({
      homePage,
      mockApi,
    }) => {
      await mockApi({ tags, articles: articleSeries(count) });

      await homePage.goto();

      await expect(homePage.articles.previews).toHaveCount(pageSize);
      await expect(homePage.articles.pagination.getByRole('button')).toHaveText(pages);
      await expect(homePage.articles.activePage).toHaveText('1');
    });
  }

  test('moving to page 2 shows the loading message, then that page', async ({
    homePage,
    mockApi,
  }) => {
    const series = articleSeries(25);
    const pageTwo = deferred();
    await mockApi({
      tags,
      articles: series,
      overrides: [
        {
          path: '/articles',
          query: { offset: String(pageSize) },
          status: 200,
          body: { articles: series.slice(pageSize, pageSize * 2), articlesCount: series.length },
          until: pageTwo.promise,
        },
      ],
    });

    await homePage.goto();
    await expect(homePage.articles.previews).toHaveCount(pageSize);
    await homePage.articles.paginationButton(2).click();

    await expect(homePage.articles.loadingMessage).toBeVisible();
    await expect(homePage.articles.previews).toHaveCount(0);

    pageTwo.release();

    await expect(homePage.articles.previews).toHaveCount(pageSize);
    // Page 2 starts at the eleventh article, and page 1's articles are gone.
    await expect(homePage.articles.preview(series[pageSize]!.title!)).toBeVisible();
    await expect(homePage.articles.preview(series[0]!.title!)).toHaveCount(0);
    await expect(homePage.articles.activePage).toHaveText('2');
  });

  // KNOWN FRONTEND GAP, pinned as observed on 2026-09-25: when the request for another page
  // fails, the list is replaced by "Loading articles..." for good. The articles already on
  // screen and the page buttons are gone too, so the user can't go back without reloading.
  // Rewrite this if the frontend gains an error state for the feed.
  test('a failed page 2 leaves the loading message and no way back', async ({
    page,
    homePage,
    mockApi,
  }) => {
    test.info().annotations.push({
      type: 'known-issue',
      description: 'A failed page request strands the user on the loading message.',
    });
    await mockApi({
      tags,
      articles: articleSeries(25),
      overrides: [
        {
          path: '/articles',
          query: { offset: String(pageSize) },
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });

    await homePage.goto();
    await expect(homePage.articles.previews).toHaveCount(pageSize);
    const pageTwoEnded = requestEnded(page, '/api/articles');
    await homePage.articles.paginationButton(2).click();
    await pageTwoEnded;
    await afterAppHandled(page);

    await expect(homePage.articles.loadingMessage).toBeVisible();
    await expect(homePage.articles.previews).toHaveCount(0);
    await expect(homePage.articles.pagination.getByRole('button')).toHaveCount(0);
    await expect(page.locator('.error-messages li')).toHaveCount(0);
  });
});

test.describe('favoriting from the feed (mocked API)', () => {
  // KNOWN FRONTEND GAP, pinned as observed on 2026-09-25: when favoriting fails, the count
  // and the button are left as they were, which is right, but nothing tells the user it
  // didn't work.
  test('a failed favorite leaves the count and button unchanged and shows no error', async ({
    page,
    homePage,
    mockApi,
  }) => {
    test.info().annotations.push({
      type: 'known-issue',
      description: 'A failed favorite request is not reported to the user.',
    });
    await mockApi({
      user: signedInUser,
      articles,
      tags,
      overrides: [
        {
          method: 'POST',
          path: `/articles/${dragonArticle.slug}/favorite`,
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });
    const favorite = homePage.articles.favoriteButton(dragonArticle.title);

    await homePage.goto();
    await expect(favorite).toHaveText(String(dragonArticle.favoritesCount));
    const favoriteEnded = requestEnded(page, `/api/articles/${dragonArticle.slug}/favorite`);
    await favorite.click();
    await favoriteEnded;
    await afterAppHandled(page);

    await expect(favorite).toHaveText(String(dragonArticle.favoritesCount));
    await expect(favorite).toHaveClass(/btn-outline-primary/);
    await expect(page.locator('.error-messages li')).toHaveCount(0);
  });
});
