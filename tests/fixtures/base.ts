import { test as base, expect, type Page } from '@playwright/test';
import { createApiClient, type ApiClient, type Article } from '@api-client/client';
import { createArticle, type NewArticleOverrides } from '@factories/article-factory';
import { createUser, type CreatedUser, type NewUserOverrides } from '@factories/user-factory';
import { installApiMock, type ApiMockConfig } from '../support/api-mock';
import {
  asBrowserSetup,
  asSetup,
  recordingDir,
  trackApiHits,
  trackBrowserHits,
  writeEndpointHits,
  type EndpointHit,
} from '../support/endpoint-hits';
import { Header } from '@pages/components/header';
import { ArticlePage } from '@pages/article-page';
import { EditorPage } from '@pages/editor-page';
import { HomePage } from '@pages/home-page';
import { LoginPage } from '@pages/login-page';
import { ProfilePage } from '@pages/profile-page';
import { RegisterPage } from '@pages/register-page';
import { SettingsPage } from '@pages/settings-page';

// Trailing slash matters: WHATWG URL joining needs it to append a relative request
// path onto baseURL's own /api segment instead of replacing it (see api-client/client.ts).
const API_BASE_URL = `${process.env.API_BASE_URL ?? 'http://localhost:8080/api'}/`.replace(
  /\/+$/,
  '/',
);

type PageObjectFixtures = {
  header: Header;
  loginPage: LoginPage;
  registerPage: RegisterPage;
  homePage: HomePage;
  editorPage: EditorPage;
  articlePage: ArticlePage;
  profilePage: ProfilePage;
  settingsPage: SettingsPage;
};

/** The page objects, as a bag — for code (like the shared scenes) that drives several pages. */
export type PageObjects = PageObjectFixtures;

type Fixtures = PageObjectFixtures & {
  endpointHits: EndpointHit[];
  pages: PageObjects;
  mockApi: (config?: ApiMockConfig) => Promise<void>;
  apiClient: ApiClient;
  userFactory: (overrides?: NewUserOverrides) => Promise<CreatedUser>;
  articleFactory: (author: CreatedUser, overrides?: NewArticleOverrides) => Promise<Article>;
  authenticatedUser: CreatedUser;
  authenticatedPage: Page;
};

export const test = base.extend<Fixtures>({
  // Collects the API endpoints this test reaches, and writes them out when it ends. Does
  // nothing unless RECORD_ENDPOINT_HITS is set. See tools/coverage-gap and docs/adr/0014.
  endpointHits: [
    async ({}, use, testInfo) => {
      const hits: EndpointHit[] = [];
      await use(hits);
      const dir = recordingDir();
      if (dir) writeEndpointHits(dir, testInfo, hits);
    },
    { auto: true },
  ],

  // The browser context, watched for API requests when recording. Everything the pages under
  // test ask the API for, including requests a route stubs, is seen here.
  context: async ({ context, endpointHits }, use) => {
    if (recordingDir()) trackBrowserHits(context, API_BASE_URL, endpointHits);
    await use(context);
  },

  // A dedicated request context scoped to the API's own base URL — never the
  // ambient `request` fixture, whose baseURL follows whatever a given project (ui,
  // visual, a11y, ...) set for the browser, i.e. the frontend, not the API.
  apiClient: async ({ playwright, endpointHits }, use) => {
    const context = await playwright.request.newContext({ baseURL: API_BASE_URL });
    await use(
      createApiClient(recordingDir() ? trackApiHits(context, API_BASE_URL, endpointHits) : context),
    );
    await context.dispose();
  },

  // Exposes a creator function, not a single instance, so a test can make more than
  // one user (e.g. to test following/favoriting between two accounts).
  userFactory: async ({ apiClient }, use) => {
    await use((overrides) => asSetup(() => createUser(apiClient, overrides)));
  },

  articleFactory: async ({ apiClient }, use) => {
    await use((author, overrides) =>
      asSetup(() => createArticle(apiClient, author.token, overrides)),
    );
  },

  authenticatedUser: async ({ userFactory }, use) => {
    await use(await userFactory());
  },

  // Logs in the way a returning user actually would: seed the token the app reads
  // from localStorage (see JwtService in the frontend) before its first navigation,
  // so the app's own auth bootstrap (GET /user with the token attached) authenticates
  // it normally. No UI login flow, no reload hack. Waits on the app's own test hook
  // rather than a UI element, so it's ready before any page object touches it.
  //
  // Seeds once, not on every navigation: an init script re-runs for each new document,
  // so without the marker a logout followed by a full page load would silently log the
  // user straight back in.
  authenticatedPage: async ({ page, authenticatedUser, endpointHits }, use) => {
    await page.addInitScript((token) => {
      if (window.localStorage.getItem('pw-token-seeded')) return;
      window.localStorage.setItem('jwtToken', token);
      window.localStorage.setItem('pw-token-seeded', '1');
    }, authenticatedUser.token);
    // The app's own bootstrap requests here prepare the test; they are not what it drives.
    await asBrowserSetup(endpointHits, async () => {
      await page.goto('/');
      await page.waitForFunction(
        () => window.__conduit_debug__?.getAuthState() === 'authenticated',
      );
    });
    await use(page);
  },

  // Answers the API from fixed stubs and blocks external assets (see support/api-mock.ts).
  // Call it before the first navigation. An API call nothing stubbed fails the test at
  // teardown, so a missing stub is loud instead of a silently blank or half-loaded page.
  mockApi: async ({ page, baseURL }, use) => {
    if (!baseURL)
      throw new Error('mockApi needs a baseURL to tell app requests from external ones');
    let mock: Awaited<ReturnType<typeof installApiMock>> | undefined;
    await use(async (config = {}) => {
      mock = await installApiMock(page, baseURL, config);
    });
    expect(mock?.unmatched ?? [], 'API requests with no stub').toEqual([]);
  },

  header: async ({ page }, use) => {
    await use(new Header(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  registerPage: async ({ page }, use) => {
    await use(new RegisterPage(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  editorPage: async ({ page }, use) => {
    await use(new EditorPage(page));
  },
  articlePage: async ({ page }, use) => {
    await use(new ArticlePage(page));
  },
  profilePage: async ({ page }, use) => {
    await use(new ProfilePage(page));
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },

  // Playwright can't rest-destructure fixtures, so code that drives several pages (the
  // shared scenes) takes them as one bag.
  pages: async (
    {
      header,
      loginPage,
      registerPage,
      homePage,
      editorPage,
      articlePage,
      profilePage,
      settingsPage,
    },
    use,
  ) => {
    await use({
      header,
      loginPage,
      registerPage,
      homePage,
      editorPage,
      articlePage,
      profilePage,
      settingsPage,
    });
  },
});

export { expect };
