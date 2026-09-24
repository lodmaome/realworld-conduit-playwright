import type { Locator, Page } from '@playwright/test';
import type { RegisterInput } from '../api-client/client';

export class RegisterPage {
  readonly heading: Locator;
  readonly usernameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly loginLink: Locator;
  readonly errors: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Sign up' });
    this.usernameInput = page.getByPlaceholder('Username', { exact: true });
    this.emailInput = page.getByPlaceholder('Email', { exact: true });
    this.passwordInput = page.getByPlaceholder('Password', { exact: true });
    this.submitButton = page.getByRole('button', { name: 'Sign up' });
    this.loginLink = page.getByRole('link', { name: 'Have an account?' });
    this.errors = page.locator('.error-messages');
  }

  async goto(): Promise<void> {
    await this.page.goto('/register');
  }

  async register({ username, email, password }: RegisterInput): Promise<void> {
    await this.usernameInput.fill(username);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
