import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/base';
import { afterAppHandled, requestEnded } from '../support/app-settled';
import { apiErrors } from '../support/api-mock';
import { articles, dragonArticle, dragonComments, signedInUser } from '../support/sample-data';

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
});
