import { buildUser } from '@factories/user-factory';
import { test, expect } from '../fixtures/base';

test.describe('registration', () => {
  test(
    'a new user can sign up and lands on the home page signed in',
    { tag: '@smoke' },
    async ({ page, registerPage, header }) => {
      const user = buildUser();

      await registerPage.goto();
      await registerPage.register(user);

      await expect(page).toHaveURL('/');
      await expect(header.profileLink(user.username)).toBeVisible();
    },
  );

  test('the sign up button stays disabled until every field is filled', async ({
    registerPage,
  }) => {
    await registerPage.goto();
    await expect(registerPage.submitButton).toBeDisabled();

    await registerPage.usernameInput.fill('someone');
    await registerPage.emailInput.fill('someone@example.test');
    await expect(registerPage.submitButton).toBeDisabled();

    await registerPage.passwordInput.fill('a-password');
    await expect(registerPage.submitButton).toBeEnabled();
  });

  test('registering with an email that is already taken shows an error', async ({
    page,
    registerPage,
    userFactory,
  }) => {
    const existing = await userFactory();

    await registerPage.goto();
    await registerPage.register(buildUser({ email: existing.email }));

    await expect(registerPage.errors).toContainText('email');
    await expect(page).toHaveURL('/register');
  });
});

test.describe('login', () => {
  test(
    'an existing user can sign in with their credentials',
    { tag: '@smoke' },
    async ({ page, loginPage, header, userFactory }) => {
      const user = await userFactory();

      await loginPage.goto();
      await loginPage.login(user.email, user.password);

      await expect(page).toHaveURL('/');
      await expect(header.profileLink(user.username)).toBeVisible();
    },
  );

  test('a wrong password shows an error and keeps the user on the login page', async ({
    page,
    loginPage,
    userFactory,
  }) => {
    const user = await userFactory();

    await loginPage.goto();
    await loginPage.login(user.email, `${user.password}-wrong`);

    await expect(loginPage.errors).toBeVisible();
    await expect(page).toHaveURL('/login');
  });
});

test.describe('session', () => {
  test(
    'a pre-authenticated user sees their own username in the header, not Sign in/Sign up',
    { tag: '@smoke' },
    async ({ authenticatedPage, authenticatedUser, header }) => {
      await expect(authenticatedPage).toHaveURL('/');
      await expect(header.profileLink(authenticatedUser.username)).toBeVisible();
      await expect(header.signInLink).toBeHidden();
      await expect(header.signUpLink).toBeHidden();
    },
  );

  test('an anonymous visitor is redirected to login when opening a protected page', async ({
    page,
    editorPage,
  }) => {
    await editorPage.goto();

    await expect(page).toHaveURL('/login');
  });
});
