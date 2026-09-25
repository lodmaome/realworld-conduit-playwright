import { test, expect } from '../fixtures/base';
import { apiErrors } from '../support/api-mock';
import { articles, signedInUser, tags } from '../support/sample-data';

test.describe('sign-in and session (mocked API)', () => {
  test('a rejected sign-in shows the server error and keeps the form', async ({
    page,
    loginPage,
    header,
    mockApi,
  }) => {
    await mockApi({
      overrides: [
        {
          method: 'POST',
          path: '/users/login',
          status: 422,
          body: apiErrors({ 'email or password': ['is invalid'] }),
        },
      ],
    });

    await loginPage.goto();
    await loginPage.login('someone@example.test', 'wrong-password');

    await expect(loginPage.errors).toHaveText('email or password is invalid');
    await expect(page).toHaveURL('/login');
    await expect(loginPage.emailInput).toHaveValue('someone@example.test');
    await expect(header.signInLink).toBeVisible();
  });

  test('a stored token the API no longer accepts signs the visitor out', async ({
    page,
    header,
    homePage,
    mockApi,
  }) => {
    // `user` seeds a token in localStorage, exactly as a returning visitor would have one;
    // the override then has the API reject it.
    await mockApi({
      user: signedInUser,
      articles,
      tags,
      overrides: [{ path: '/user', status: 401, body: apiErrors({ token: ['is invalid'] }) }],
    });

    await homePage.goto();
    await page.waitForFunction(
      () => window.__conduit_debug__?.getAuthState() === 'unauthenticated',
    );

    await expect(header.signInLink).toBeVisible();
    await expect(header.profileLink(signedInUser.username)).toBeHidden();
    await expect(homePage.articles.previews).toHaveCount(articles.length);
    // The dead token is dropped, not left to be retried on every page load.
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('jwtToken')))
      .toBeNull();
  });
});
