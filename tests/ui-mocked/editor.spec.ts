import { test, expect } from '../fixtures/base';
import { afterAppHandled, recordRequests, requestEnded } from '../support/app-settled';
import { apiErrors, deferred } from '../support/api-mock';
import { articles, dragonArticle, signedInUser } from '../support/sample-data';

const draft = {
  title: 'A draft title',
  description: 'A draft description',
  body: 'A draft body.',
  tagList: ['alpha', 'beta'],
};

test.describe('editor (mocked API)', () => {
  test('a server error on publish shows the error and keeps the whole draft', async ({
    page,
    editorPage,
    mockApi,
  }) => {
    await mockApi({
      user: signedInUser,
      overrides: [
        {
          method: 'POST',
          path: '/articles',
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });

    await editorPage.goto();
    await editorPage.fillArticle(draft);
    await editorPage.publish();

    await expect(editorPage.errors).toHaveText('server Something went wrong');
    await expect(page).toHaveURL('/editor');
    await expect(editorPage.titleInput).toHaveValue(draft.title);
    await expect(editorPage.descriptionInput).toHaveValue(draft.description);
    await expect(editorPage.bodyInput).toHaveValue(draft.body);
    await expect(editorPage.tags).toHaveText(draft.tagList);
    // The user can try again.
    await expect(editorPage.publishButton).toBeEnabled();
  });

  // Not `dblclick()`: it sends both clicks inside one JavaScript task, which no mouse can, and
  // the button only disables itself after that task. Measured 2026-09-25: two clicks in the
  // same task sent two requests; two clicks 1ms or more apart sent one. See ADR-0013.
  test('Publish is disabled while sending, and a second click sends nothing', async ({
    page,
    editorPage,
    mockApi,
  }) => {
    const serverReply = deferred();
    await mockApi({
      user: signedInUser,
      articles,
      overrides: [
        {
          method: 'POST',
          path: '/articles',
          status: 200,
          body: { article: dragonArticle },
          until: serverReply.promise,
        },
      ],
    });
    const publishRequests = recordRequests(page, 'POST', '/api/articles');

    await editorPage.goto();
    await editorPage.fillArticle({ ...draft, tagList: [] });
    await editorPage.publishButton.click();

    // The reply is held back, so this is the in-flight state.
    await expect(editorPage.publishButton).toBeDisabled();
    await editorPage.publishButton.evaluate((button) => (button as HTMLButtonElement).click());
    serverReply.release();

    await expect(page).toHaveURL(`/article/${dragonArticle.slug}`);
    expect(publishRequests).toHaveLength(1);
  });

  // KNOWN FRONTEND GAP, pinned as observed on 2026-09-25: opening the editor for an article
  // that doesn't exist (the API answers 404) shows an empty editor, as if for a new article,
  // with no error. Saving from it would send an update for an article that isn't there.
  // Rewrite this if the frontend gains a not-found state.
  test('opens an empty editor, with no error, for an article that does not exist', async ({
    page,
    editorPage,
    mockApi,
  }) => {
    test.info().annotations.push({
      type: 'known-issue',
      description: 'Editing an unknown article opens a blank editor with no not-found message.',
    });
    await mockApi({ user: signedInUser, articles });

    const articleEnded = requestEnded(page, '/api/articles/no-such-article');
    await editorPage.gotoEdit('no-such-article');
    await articleEnded;
    await afterAppHandled(page);

    await expect(page).toHaveURL('/editor/no-such-article');
    await expect(editorPage.titleInput).toBeEmpty();
    await expect(editorPage.errors.getByRole('listitem')).toHaveCount(0);
  });
});
