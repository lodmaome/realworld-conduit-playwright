import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/base';
import { afterAppHandled, requestEnded } from '../support/app-settled';
import { apiErrors } from '../support/api-mock';
import {
  anna,
  articles,
  dragonArticle,
  dragonComments,
  signedInUser,
  testingArticle,
} from '../support/sample-data';

const commentsUrl = `/articles/${dragonArticle.slug}/comments`;
const signedIn = {
  user: signedInUser,
  articles,
  comments: { [dragonArticle.slug]: dragonComments },
};

// The mocked project blocks the Ionicons stylesheet on purpose (tests/support/api-mock.ts),
// so the trash icon is an empty <i> with no size and Playwright rightly calls it not
// visible. The icon has no role or name to target either, so the click is dispatched
// straight to the element the app's handler is bound to. That gives up the visibility check
// for this one click; the comment being present beforehand and afterwards is asserted.
async function clickDeleteOn(page: Page, comment: ReturnType<Page['locator']>): Promise<void> {
  await comment.locator('.mod-options .ion-trash-a').dispatchEvent('click');
}

test.describe('article page (mocked API)', () => {
  test('a rejected comment shows the server error and keeps what was typed', async ({
    articlePage,
    mockApi,
  }) => {
    await mockApi({
      ...signedIn,
      overrides: [
        {
          method: 'POST',
          path: commentsUrl,
          status: 422,
          body: apiErrors({ body: ["can't be blank"] }),
        },
      ],
    });
    const draft = 'A draft the server will refuse';

    await articlePage.goto(dragonArticle.slug);
    await expect(articlePage.comments).toHaveCount(dragonComments.length);
    await articlePage.addComment(draft);

    await expect(articlePage.errors).toHaveText(["body can't be blank"]);
    await expect(articlePage.commentInput).toHaveValue(draft);
    await expect(articlePage.comments).toHaveCount(dragonComments.length);
  });

  test('a failed comment delete shows the error and keeps the comment', async ({
    page,
    articlePage,
    mockApi,
  }) => {
    await mockApi({
      ...signedIn,
      overrides: [
        {
          method: 'DELETE',
          path: new RegExp(`^${commentsUrl}/\\d+$`),
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });
    const text = dragonComments[0]!.body!;

    await articlePage.goto(dragonArticle.slug);
    await expect(articlePage.comment(text)).toBeVisible();
    await clickDeleteOn(page, articlePage.comment(text));

    await expect(articlePage.errors).toHaveText(['server Something went wrong']);
    await expect(articlePage.comment(text)).toBeVisible();
    await expect(articlePage.comments).toHaveCount(dragonComments.length);
  });

  // KNOWN FRONTEND GAP, pinned as observed on 2026-09-25: an article the API says doesn't
  // exist (404) renders a blank page: no title, no body, no error message (only an empty
  // error list, which shows nothing). This asserts
  // that behaviour so a change is noticed; if the frontend gains a not-found state it will
  // fail, and should be rewritten to assert it.
  // See docs/adr/0013-api-overrides-for-the-mocked-ui-project.md.
  test('renders no article and no error for a slug that does not exist', async ({
    page,
    articlePage,
    mockApi,
  }) => {
    test.info().annotations.push({
      type: 'known-issue',
      description: 'An unknown article renders a blank page with no not-found message.',
    });
    await mockApi({ articles });

    const articleEnded = requestEnded(page, '/api/articles/no-such-article');
    await articlePage.goto('no-such-article');
    await articleEnded;
    await afterAppHandled(page);

    await expect(articlePage.title).toHaveCount(0);
    await expect(articlePage.body).toHaveCount(0);
    await expect(articlePage.errors).toHaveCount(0);
  });

  // KNOWN FRONTEND GAP, pinned as observed on 2026-09-25: the article and its comments are
  // loaded together, so when only the comments request fails, the article that loaded fine
  // is not shown either. Same handling as above: rewrite this if the frontend changes.
  test('renders nothing, not even the article, when only its comments fail to load', async ({
    page,
    articlePage,
    mockApi,
  }) => {
    test.info().annotations.push({
      type: 'known-issue',
      description: 'A failed comments request blanks the whole article page.',
    });
    await mockApi({
      articles,
      overrides: [
        { path: commentsUrl, status: 500, body: apiErrors({ server: ['Something went wrong'] }) },
      ],
    });

    const commentsEnded = requestEnded(page, `/api${commentsUrl}`);
    await articlePage.goto(dragonArticle.slug);
    await commentsEnded;
    await afterAppHandled(page);

    await expect(articlePage.title).toHaveCount(0);
    await expect(articlePage.body).toHaveCount(0);
    await expect(articlePage.errors).toHaveCount(0);
  });

  // Markup in a body or title is data, not something to run. This is a rendering check on an
  // edge-case payload, not a security scan (which is out of scope, see the strategy doc).
  test('renders markup in an article as inert content', async ({ page, articlePage, mockApi }) => {
    const hostile = {
      ...dragonArticle,
      title: 'Hostile <b>title</b> & "quotes"',
      body: [
        '<script>window.__pwned = 1</script>',
        '<img src=x onerror="window.__pwned = 2">',
        '[a link](javascript:window.__pwned=3)',
        'Ordinary **bold** text.',
      ].join('\n\n'),
    };
    await mockApi({ articles: [hostile], comments: { [hostile.slug]: [] } });

    await articlePage.goto(hostile.slug);
    await expect(articlePage.body).toContainText('Ordinary');

    // The title is shown as typed, tags and all, not interpreted.
    await expect(articlePage.title).toHaveText(hostile.title);
    await expect(articlePage.body.locator('strong')).toHaveText('bold');
    await expect(articlePage.body.locator('script')).toHaveCount(0);
    await expect(articlePage.body.getByRole('link', { name: 'a link' })).not.toHaveAttribute(
      'href',
      /^javascript:/i,
    );
    // No element in the body carries an inline event handler...
    const handlers = await articlePage.body.evaluate(
      (body) =>
        [body, ...Array.from(body.querySelectorAll('*'))].filter((el) =>
          el.getAttributeNames().some((name) => name.startsWith('on')),
        ).length,
    );
    expect(handlers).toBe(0);
    // ...and nothing the payload tried to run did run.
    expect(await page.evaluate(() => '__pwned' in window)).toBe(false);
  });

  test.describe('long content', () => {
    const scrollsSideways = (page: Page) =>
      page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );

    test('a long body of ordinary words wraps and does not widen the page', async ({
      page,
      articlePage,
      mockApi,
    }) => {
      const wordy = { ...dragonArticle, body: 'ordinary words '.repeat(200) };
      await mockApi({ articles: [wordy], comments: { [wordy.slug]: [] } });

      await articlePage.goto(wordy.slug);
      await expect(articlePage.body).toContainText('ordinary words');

      expect(await scrollsSideways(page)).toBe(false);
    });

    // KNOWN FRONTEND GAP, pinned as observed on 2026-09-25: a single unbroken run of
    // characters (a long URL, a hash, pasted junk) is not wrapped, so it widens the page and
    // the whole page scrolls sideways. 400 characters gave a 5826px-wide page against 1280px;
    // the same 400 characters split by spaces did not. Rewrite this if the frontend wraps it.
    test('a body with one unbroken 400-character run widens the page', async ({
      page,
      articlePage,
      mockApi,
    }) => {
      test.info().annotations.push({
        type: 'known-issue',
        description: 'An unbroken run of characters in a body makes the page scroll sideways.',
      });
      const unbroken = { ...dragonArticle, body: 'A'.repeat(400) };
      await mockApi({ articles: [unbroken], comments: { [unbroken.slug]: [] } });

      await articlePage.goto(unbroken.slug);
      await expect(articlePage.body).toContainText('AAAA');

      expect(await scrollsSideways(page)).toBe(true);
    });
  });
});

test.describe('article actions that fail (mocked API)', () => {
  // KNOWN FRONTEND GAPS, pinned as observed on 2026-09-25. Deleting a comment that fails does
  // show its error (tested above); the three actions on the article itself do not. A failed
  // delete leaves the reader on the article with no message, and a failed favorite or follow
  // leaves the button and count as they were (right) but says nothing (not right). Rewrite
  // these if the frontend starts reporting them.
  test('a failed article delete keeps the article and shows no error', async ({
    page,
    articlePage,
    mockApi,
  }) => {
    test.info().annotations.push({
      type: 'known-issue',
      description: 'A failed article delete is not reported to the author.',
    });
    await mockApi({
      user: signedInUser,
      articles,
      overrides: [
        {
          method: 'DELETE',
          path: `/articles/${testingArticle.slug}`,
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });

    await articlePage.goto(testingArticle.slug);
    await expect(articlePage.deleteButton).toBeVisible();
    const deleteEnded = requestEnded(page, `/api/articles/${testingArticle.slug}`);
    await articlePage.deleteButton.click();
    await deleteEnded;
    await afterAppHandled(page);

    await expect(page).toHaveURL(`/article/${testingArticle.slug}`);
    await expect(articlePage.title).toHaveText(testingArticle.title);
    await expect(articlePage.errors).toHaveCount(0);
  });

  test('a failed favorite leaves the article as it was and shows no error', async ({
    page,
    articlePage,
    mockApi,
  }) => {
    test.info().annotations.push({
      type: 'known-issue',
      description: 'A failed favorite request is not reported on the article page.',
    });
    await mockApi({
      user: signedInUser,
      articles,
      overrides: [
        {
          method: 'POST',
          path: `/articles/${dragonArticle.slug}/favorite`,
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });

    await articlePage.goto(dragonArticle.slug);
    await expect(articlePage.favoriteButton).toBeVisible();
    const favoriteEnded = requestEnded(page, `/api/articles/${dragonArticle.slug}/favorite`);
    await articlePage.favoriteButton.click();
    await favoriteEnded;
    await afterAppHandled(page);

    await expect(articlePage.favoriteButton).toBeVisible();
    await expect(articlePage.unfavoriteButton).toHaveCount(0);
    await expect(articlePage.favoritesCount).toHaveText(`(${dragonArticle.favoritesCount})`);
    await expect(articlePage.errors).toHaveCount(0);
  });

  test('a failed follow leaves the author unfollowed and shows no error', async ({
    page,
    articlePage,
    mockApi,
  }) => {
    test.info().annotations.push({
      type: 'known-issue',
      description: 'A failed follow request is not reported on the article page.',
    });
    await mockApi({
      user: signedInUser,
      articles,
      overrides: [
        {
          method: 'POST',
          path: `/profiles/${anna.username}/follow`,
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });

    await articlePage.goto(dragonArticle.slug);
    await expect(articlePage.followButton(anna.username)).toBeVisible();
    const followEnded = requestEnded(page, `/api/profiles/${anna.username}/follow`);
    await articlePage.followButton(anna.username).click();
    await followEnded;
    await afterAppHandled(page);

    await expect(articlePage.followButton(anna.username)).toBeVisible();
    await expect(articlePage.unfollowButton(anna.username)).toHaveCount(0);
    await expect(articlePage.errors).toHaveCount(0);
  });
});
