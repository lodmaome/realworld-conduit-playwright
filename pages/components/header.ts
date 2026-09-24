import type { Locator, Page } from '@playwright/test';

export class Header {
  // Scoped to the navbar: pages elsewhere reuse the same link names (the article page
  // has its own "Sign in" link in the comments area), which would otherwise trip
  // Playwright's strict mode. `.navbar` is part of the shared RealWorld theme.
  private readonly root: Locator;

  readonly homeLink: Locator;
  readonly signInLink: Locator;
  readonly signUpLink: Locator;
  readonly newArticleLink: Locator;
  readonly settingsLink: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('nav.navbar');
    this.homeLink = this.root.getByRole('link', { name: 'Home' });
    this.signInLink = this.root.getByRole('link', { name: 'Sign in' });
    this.signUpLink = this.root.getByRole('link', { name: 'Sign up' });
    this.newArticleLink = this.root.getByRole('link', { name: 'New Article' });
    this.settingsLink = this.root.getByRole('link', { name: 'Settings' });
  }

  // The link's accessible name is the username: its <img> has no alt text.
  profileLink(username: string): Locator {
    return this.root.getByRole('link', { name: username, exact: true });
  }
}
