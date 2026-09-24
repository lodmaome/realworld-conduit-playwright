import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly heading: Locator;
  // The form has no <label>s, so placeholders are the only accessible hook.
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly registerLink: Locator;
  // `.error-messages` is the shared RealWorld theme's class for the error list.
  readonly errors: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Sign in' });
    this.emailInput = page.getByPlaceholder('Email', { exact: true });
    this.passwordInput = page.getByPlaceholder('Password', { exact: true });
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.registerLink = page.getByRole('link', { name: 'Need an account?' });
    this.errors = page.locator('.error-messages');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
