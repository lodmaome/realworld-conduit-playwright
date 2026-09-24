import type { Locator, Page } from '@playwright/test';
import { ArticleList } from './components/article-list';

export class HomePage {
  readonly articles: ArticleList;
  readonly yourFeedTab: Locator;
  readonly globalFeedTab: Locator;
  readonly activeFeedTab: Locator;
  readonly popularTags: Locator;

  constructor(private readonly page: Page) {
    this.articles = new ArticleList(page);
    this.yourFeedTab = page.getByRole('link', { name: 'Your Feed' });
    this.globalFeedTab = page.getByRole('link', { name: 'Global Feed' });
    // The selected tab is only marked by a CSS state class — there's no aria-current.
    this.activeFeedTab = page.locator('.feed-toggle .nav-link.active');
    this.popularTags = page.locator('.sidebar .tag-list');
  }

  tag(name: string): Locator {
    return this.popularTags.getByRole('link', { name, exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async gotoFollowingFeed(): Promise<void> {
    await this.page.goto('/?feed=following');
  }

  async gotoTag(tag: string): Promise<void> {
    await this.page.goto(`/tag/${encodeURIComponent(tag)}`);
  }
}
