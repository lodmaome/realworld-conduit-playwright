import type { Locator, Page } from '@playwright/test';

export type SettingsInput = Partial<{
  image: string;
  username: string;
  bio: string;
  email: string;
  password: string;
}>;

export class SettingsPage {
  readonly imageInput: Locator;
  readonly usernameInput: Locator;
  readonly bioInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly updateButton: Locator;
  readonly logoutButton: Locator;
  readonly errors: Locator;

  constructor(private readonly page: Page) {
    this.imageInput = page.getByPlaceholder('URL of profile picture');
    this.usernameInput = page.getByPlaceholder('Username', { exact: true });
    this.bioInput = page.getByPlaceholder('Short bio about you');
    this.emailInput = page.getByPlaceholder('Email', { exact: true });
    this.passwordInput = page.getByPlaceholder('New Password');
    this.updateButton = page.getByRole('button', { name: 'Update Settings' });
    this.logoutButton = page.getByRole('button', { name: 'Or click here to logout.' });
    this.errors = page.locator('.error-messages');
  }

  async goto(): Promise<void> {
    await this.page.goto('/settings');
  }

  // Only the fields provided are touched; the form is pre-filled with the current values.
  async update({ image, username, bio, email, password }: SettingsInput): Promise<void> {
    if (image !== undefined) await this.imageInput.fill(image);
    if (username !== undefined) await this.usernameInput.fill(username);
    if (bio !== undefined) await this.bioInput.fill(bio);
    if (email !== undefined) await this.emailInput.fill(email);
    if (password !== undefined) await this.passwordInput.fill(password);
    await this.updateButton.click();
  }
}
