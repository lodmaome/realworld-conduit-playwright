import type { Locator, Page } from '@playwright/test';
import { ArticleList } from './components/article-list';
import { iconLabel } from './components/icon-label';

export class ProfilePage {
  readonly articles: ArticleList;
  readonly username: Locator;
  readonly bio: Locator;
  readonly editProfileLink: Locator;
  readonly myPostsTab: Locator;
  readonly favoritedPostsTab: Locator;
  // One entry per error message. The `.error-messages` list itself is always in the
  // markup, empty until something fails, so it can't tell "no error" from "an error".
  readonly errors: Locator;

  private readonly userInfo: Locator;

  constructor(private readonly page: Page) {
    this.articles = new ArticleList(page);
    this.userInfo = page.locator('.user-info');
    this.username = this.userInfo.getByRole('heading', { level: 4 });
    this.bio = this.userInfo.locator('p');
    this.editProfileLink = page.getByRole('link', { name: 'Edit Profile Settings' });
    this.myPostsTab = page.getByRole('link', { name: 'My Posts' });
    this.favoritedPostsTab = page.getByRole('link', { name: 'Favorited Posts' });
    this.errors = page.locator('.error-messages li');
  }

  followButton(username: string): Locator {
    return this.userInfo.getByRole('button', { name: iconLabel(`Follow ${username}`) });
  }

  unfollowButton(username: string): Locator {
    return this.userInfo.getByRole('button', { name: iconLabel(`Unfollow ${username}`) });
  }

  async goto(username: string): Promise<void> {
    await this.page.goto(`/profile/${encodeURIComponent(username)}`);
  }

  async gotoFavorites(username: string): Promise<void> {
    await this.page.goto(`/profile/${encodeURIComponent(username)}/favorites`);
  }
}
