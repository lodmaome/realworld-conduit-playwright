import { test, expect } from '../fixtures/base';
import { recordRequests } from '../support/app-settled';
import { apiErrors, deferred } from '../support/api-mock';
import { articles, jake, signedInUser } from '../support/sample-data';

test.describe('settings (mocked API)', () => {
  test('a server error on update shows the error and keeps what was typed', async ({
    page,
    settingsPage,
    mockApi,
  }) => {
    await mockApi({
      user: signedInUser,
      overrides: [
        {
          method: 'PUT',
          path: '/user',
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });

    await settingsPage.goto();
    await settingsPage.update({ bio: 'A new bio' });

    await expect(settingsPage.errors).toHaveText('server Something went wrong');
    await expect(page).toHaveURL('/settings');
    await expect(settingsPage.bioInput).toHaveValue('A new bio');
    await expect(settingsPage.updateButton).toBeEnabled();
  });

  // Not `dblclick()`, for the reason given in editor.spec.ts.
  test('Update Settings is disabled while sending, and a second click sends nothing', async ({
    page,
    settingsPage,
    mockApi,
  }) => {
    const serverReply = deferred();
    await mockApi({
      user: signedInUser,
      articles,
      profiles: [jake],
      overrides: [
        {
          method: 'PUT',
          path: '/user',
          status: 200,
          body: { user: { ...signedInUser, bio: 'Changed' } },
          until: serverReply.promise,
        },
      ],
    });
    const updateRequests = recordRequests(page, 'PUT', '/api/user');

    await settingsPage.goto();
    await settingsPage.bioInput.fill('Changed');
    await settingsPage.updateButton.click();

    await expect(settingsPage.updateButton).toBeDisabled();
    await settingsPage.updateButton.evaluate((button) => (button as HTMLButtonElement).click());
    serverReply.release();

    await expect(page).toHaveURL(`/profile/${jake.username}`);
    expect(updateRequests).toHaveLength(1);
  });
});
