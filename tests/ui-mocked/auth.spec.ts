import { test, expect } from '../fixtures/base';
import { recordRequests } from '../support/app-settled';
import { apiErrors, deferred } from '../support/api-mock';
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

test.describe('registration (mocked API)', () => {
  const details = {
    username: 'newcomer',
    email: 'newcomer@example.test',
    password: 'a-long-password',
  };

  test('rejected details show every server message and keep the form', async ({
    page,
    registerPage,
    mockApi,
  }) => {
    await mockApi({
      overrides: [
        {
          method: 'POST',
          path: '/users',
          status: 422,
          body: apiErrors({ username: ['has already been taken'], email: ['is invalid'] }),
        },
      ],
    });

    await registerPage.goto();
    await registerPage.register(details);

    await expect(registerPage.errors.getByRole('listitem')).toHaveText([
      'username has already been taken',
      'email is invalid',
    ]);
    await expect(page).toHaveURL('/register');
    await expect(registerPage.usernameInput).toHaveValue(details.username);
    await expect(registerPage.emailInput).toHaveValue(details.email);
  });

  test('a server error shows the message, and the form can be submitted again', async ({
    page,
    registerPage,
    mockApi,
  }) => {
    await mockApi({
      overrides: [
        {
          method: 'POST',
          path: '/users',
          status: 500,
          body: apiErrors({ server: ['Something went wrong'] }),
        },
      ],
    });

    await registerPage.goto();
    await registerPage.register(details);

    await expect(registerPage.errors.getByRole('listitem')).toHaveText([
      'server Something went wrong',
    ]);
    await expect(page).toHaveURL('/register');
    await expect(registerPage.submitButton).toBeEnabled();
  });

  // Not `dblclick()`, for the reason given in editor.spec.ts. The held reply ends as a
  // rejection so the test finishes on the register page, without signing anyone in.
  test('Sign up is disabled while sending, and a second click sends nothing', async ({
    page,
    registerPage,
    mockApi,
  }) => {
    const serverReply = deferred();
    await mockApi({
      overrides: [
        {
          method: 'POST',
          path: '/users',
          status: 422,
          body: apiErrors({ email: ['is invalid'] }),
          until: serverReply.promise,
        },
      ],
    });
    const registerRequests = recordRequests(page, 'POST', '/api/users');

    await registerPage.goto();
    await registerPage.register(details);

    await expect(registerPage.submitButton).toBeDisabled();
    await registerPage.submitButton.evaluate((button) => (button as HTMLButtonElement).click());
    serverReply.release();

    await expect(registerPage.errors.getByRole('listitem')).toHaveText(['email is invalid']);
    await expect(registerPage.submitButton).toBeEnabled();
    expect(registerRequests).toHaveLength(1);
  });
});
