import { expect, type PageObjects } from '../fixtures/base';
import type { ApiMockConfig } from './api-mock';
import {
  anna,
  articles,
  dragonArticle,
  dragonComments,
  jake,
  signedInUser,
  tags,
  testingArticle,
} from './sample-data';

/**
 * A page in a specific state, described once and shared: the visual suite screenshots
 * it and the a11y suite scans it. Keeping one list means the two suites can't quietly
 * drift apart on which pages and states they cover.
 */
export type Scene = {
  name: string;
  api: ApiMockConfig;
  open: (pages: PageObjects) => Promise<void>;
  /** Waits until the page has actually rendered the state — web-first assertions, no sleeps. */
  ready: (pages: PageObjects) => Promise<void>;
};

const global = { articles, tags, profiles: [anna, jake] };
const comments = { [dragonArticle.slug]: dragonComments };

export const scenes: Scene[] = [
  {
    name: 'home-anonymous',
    api: global,
    open: ({ homePage }) => homePage.goto(),
    ready: async ({ homePage }) => {
      await expect(homePage.articles.previews).toHaveCount(articles.length);
      await expect(homePage.popularTags.getByRole('link')).toHaveCount(tags.length);
    },
  },
  {
    name: 'home-signed-in',
    api: { ...global, user: signedInUser },
    open: ({ homePage }) => homePage.goto(),
    ready: async ({ homePage, header }) => {
      await expect(header.profileLink(jake.username)).toBeVisible();
      await expect(homePage.yourFeedTab).toBeVisible();
      await expect(homePage.articles.previews).toHaveCount(articles.length);
    },
  },
  {
    name: 'home-your-feed-empty',
    api: { ...global, user: signedInUser, feed: [] },
    open: ({ homePage }) => homePage.gotoFollowingFeed(),
    ready: async ({ homePage }) => {
      await expect(homePage.articles.emptyMessage).toContainText('Your feed is empty');
    },
  },
  {
    name: 'article-anonymous',
    api: { ...global, comments },
    open: ({ articlePage }) => articlePage.goto(dragonArticle.slug),
    ready: async ({ articlePage }) => {
      await expect(articlePage.title).toHaveText(dragonArticle.title);
      await expect(articlePage.body).toContainText('Very carefully');
      await expect(articlePage.comments).toHaveCount(dragonComments.length);
      await expect(articlePage.commentSignInPrompt).toBeVisible();
    },
  },
  {
    name: 'article-own-signed-in',
    api: { ...global, user: signedInUser, comments },
    open: ({ articlePage }) => articlePage.goto(testingArticle.slug),
    ready: async ({ articlePage }) => {
      await expect(articlePage.title).toHaveText(testingArticle.title);
      await expect(articlePage.editLink).toBeVisible();
      await expect(articlePage.deleteButton).toBeVisible();
    },
  },
  {
    name: 'login',
    api: {},
    open: ({ loginPage }) => loginPage.goto(),
    ready: async ({ loginPage }) => {
      await expect(loginPage.heading).toBeVisible();
    },
  },
  {
    name: 'register',
    api: {},
    open: ({ registerPage }) => registerPage.goto(),
    ready: async ({ registerPage }) => {
      await expect(registerPage.heading).toBeVisible();
    },
  },
  {
    name: 'editor',
    api: { user: signedInUser },
    open: ({ editorPage }) => editorPage.goto(),
    ready: async ({ editorPage }) => {
      await expect(editorPage.publishButton).toBeVisible();
    },
  },
  {
    name: 'settings',
    api: { user: signedInUser },
    open: ({ settingsPage }) => settingsPage.goto(),
    ready: async ({ settingsPage }) => {
      await expect(settingsPage.usernameInput).toHaveValue(signedInUser.username);
    },
  },
  {
    name: 'profile',
    api: { ...global, user: signedInUser },
    open: ({ profilePage }) => profilePage.goto(anna.username),
    ready: async ({ profilePage }) => {
      await expect(profilePage.username).toHaveText(anna.username);
      await expect(profilePage.articles.previews).not.toHaveCount(0);
    },
  },
];
