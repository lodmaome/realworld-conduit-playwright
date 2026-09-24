import type { Locator, Page } from '@playwright/test';

/**
 * The paginated article list shared by the home feed and the profile pages.
 */
export class ArticleList {
  // The loading and empty states reuse the `.article-preview` class for their own
  // wrapper, so a real preview is identified by the heading it contains.
  readonly previews: Locator;
  readonly loadingMessage: Locator;
  readonly emptyMessage: Locator;
  readonly pagination: Locator;

  constructor(private readonly page: Page) {
    this.previews = page.locator('.article-preview').filter({ has: page.getByRole('heading') });
    this.loadingMessage = page.getByText('Loading articles...');
    this.emptyMessage = page.locator('.empty-feed-message');
    this.pagination = page.locator('.pagination');
  }

  preview(title: string): Locator {
    return this.previews.filter({
      has: this.page.getByRole('heading', { name: title, exact: true }),
    });
  }

  async open(title: string): Promise<void> {
    await this.preview(title).getByRole('heading', { name: title, exact: true }).click();
  }

  // The preview's only button is the favorite toggle; its label is the favorite count.
  favoriteButton(title: string): Locator {
    return this.preview(title).getByRole('button');
  }

  paginationButton(pageNumber: number): Locator {
    return this.pagination.getByRole('button', { name: String(pageNumber), exact: true });
  }
}
