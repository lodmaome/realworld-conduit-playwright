import type { Locator, Page } from '@playwright/test';
import { ArticleList } from './components/article-list';

export class HomePage {
  readonly articles: ArticleList;
  readonly yourFeedTab: Locator;
  readonly globalFeedTab: Locator;
  readonly activeFeedTab: Locator;
  readonly popularTags: Locator;
  // The sidebar is absent from the page until the tags request has been answered.
  readonly tagsLoadingMessage: Locator;
  readonly noTagsMessage: Locator;

  constructor(private readonly page: Page) {
    this.articles = new ArticleList(page);
    this.yourFeedTab = page.getByRole('link', { name: 'Your Feed' });
    this.globalFeedTab = page.getByRole('link', { name: 'Global Feed' });
    // The selected tab is only marked by a CSS state class, there's no aria-current. The
    // tag tab is always in the markup, hidden until a tag is chosen, and carries that class
    // too, so hidden items are excluded.
    this.activeFeedTab = page.locator('.feed-toggle .nav-item:not([hidden]) .nav-link.active');
    this.popularTags = page.locator('.sidebar .tag-list');
    this.tagsLoadingMessage = page.getByText('Loading tags...');
    this.noTagsMessage = page.getByText('No tags are here... yet.');
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
