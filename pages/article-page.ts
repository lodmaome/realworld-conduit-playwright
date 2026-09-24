import type { Locator, Page } from '@playwright/test';
import { iconLabel } from './components/icon-label';

export class ArticlePage {
  // The article's action buttons (edit, delete, follow, favorite) are rendered twice:
  // in the top banner and again in the footer. Everything action-related is scoped to
  // the banner so strict mode sees exactly one match.
  private readonly banner: Locator;

  readonly title: Locator;
  readonly author: Locator;
  readonly body: Locator;
  readonly tags: Locator;
  readonly editLink: Locator;
  readonly deleteButton: Locator;
  readonly favoriteButton: Locator;
  readonly unfavoriteButton: Locator;
  readonly favoritesCount: Locator;

  readonly commentInput: Locator;
  readonly postCommentButton: Locator;
  readonly comments: Locator;
  // Load, comment-post, and comment-delete failures each render their own error list.
  readonly errors: Locator;
  // Shown instead of the comment form to anonymous visitors.
  readonly commentSignInPrompt: Locator;

  constructor(private readonly page: Page) {
    this.banner = page.locator('.banner');

    this.title = this.banner.getByRole('heading', { level: 1 });
    this.author = this.banner.locator('.author');
    this.body = page.locator('.article-content');
    this.tags = page.locator('.article-content .tag-list li');
    this.editLink = this.banner.getByRole('link', { name: 'Edit Article' });
    this.deleteButton = this.banner.getByRole('button', { name: 'Delete Article' });
    this.favoriteButton = this.banner.getByRole('button', { name: iconLabel('Favorite Article') });
    this.unfavoriteButton = this.banner.getByRole('button', {
      name: iconLabel('Unfavorite Article'),
    });
    this.favoritesCount = this.banner.locator('.counter');

    this.commentInput = page.getByPlaceholder('Write a comment...');
    this.postCommentButton = page.getByRole('button', { name: 'Post Comment' });
    // The comment form is also a `.card`; only real comments contain `.card-text`.
    this.comments = page.locator('.card').filter({ has: page.locator('.card-text') });
    this.errors = page.locator('.error-messages');
    this.commentSignInPrompt = page.getByText('to add comments on this article');
  }

  followButton(username: string): Locator {
    return this.banner.getByRole('button', { name: iconLabel(`Follow ${username}`) });
  }

  unfollowButton(username: string): Locator {
    return this.banner.getByRole('button', { name: iconLabel(`Unfollow ${username}`) });
  }

  comment(text: string): Locator {
    return this.comments.filter({ hasText: text });
  }

  // The trash icon is a bare <i> with a click handler — no role or accessible name.
  async deleteComment(text: string): Promise<void> {
    await this.comment(text).locator('.mod-options .ion-trash-a').click();
  }

  async goto(slug: string): Promise<void> {
    await this.page.goto(`/article/${slug}`);
  }

  async addComment(text: string): Promise<void> {
    await this.commentInput.fill(text);
    await this.postCommentButton.click();
  }

  // Only meaningful once the page is on an article URL — callers should assert the
  // URL first, since this reads it synchronously.
  slug(): string {
    const slug = new URL(this.page.url()).pathname.split('/').pop();
    if (!slug) throw new Error(`Not on an article page: ${this.page.url()}`);
    return slug;
  }
}
