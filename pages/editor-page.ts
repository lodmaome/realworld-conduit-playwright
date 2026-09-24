import type { Locator, Page } from '@playwright/test';
import type { ArticleInput } from '../api-client/client';

export class EditorPage {
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly bodyInput: Locator;
  readonly tagInput: Locator;
  readonly tags: Locator;
  readonly publishButton: Locator;
  readonly errors: Locator;

  constructor(private readonly page: Page) {
    this.titleInput = page.getByPlaceholder('Article Title');
    this.descriptionInput = page.getByPlaceholder("What's this article about?");
    this.bodyInput = page.getByPlaceholder('Write your article (in markdown)');
    this.tagInput = page.getByPlaceholder('Enter tags');
    this.tags = page.locator('.tag-list .tag-pill');
    this.publishButton = page.getByRole('button', { name: 'Publish Article' });
    this.errors = page.locator('.error-messages');
  }

  async goto(): Promise<void> {
    await this.page.goto('/editor');
  }

  async gotoEdit(slug: string): Promise<void> {
    await this.page.goto(`/editor/${slug}`);
  }

  async fillArticle({ title, description, body, tagList = [] }: ArticleInput): Promise<void> {
    await this.titleInput.fill(title);
    await this.descriptionInput.fill(description);
    await this.bodyInput.fill(body);
    for (const tag of tagList) {
      await this.tagInput.fill(tag);
      await this.tagInput.press('Enter');
    }
  }

  // The remove control is a bare <i> icon inside the tag pill — no role or name.
  async removeTag(tag: string): Promise<void> {
    await this.tags.filter({ hasText: tag }).locator('.ion-close-round').click();
  }

  // Click only — a successful publish navigates to the article, but a validation
  // failure stays here, so callers assert whichever outcome they expect.
  async publish(): Promise<void> {
    await this.publishButton.click();
  }
}
