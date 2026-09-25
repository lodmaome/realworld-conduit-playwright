import type { StubArticle, StubComment, StubProfile, StubUser } from './api-mock';

// Everything here is fixed on purpose — visual baselines and a11y results must not depend
// on the clock, the database, or another test's data. Timestamps are UTC because the
// visual/a11y projects pin `timezoneId: 'UTC'`; avatars are null so the app falls back to
// its own bundled default image instead of an external URL.

export const anna = {
  username: 'anna',
  bio: 'Dragon trainer. Writes about flight safety.',
  image: null,
  following: false,
} satisfies StubProfile;

export const jake = {
  username: 'jake',
  bio: 'I work at statefarm',
  image: null,
  following: false,
} satisfies StubProfile;

export const signedInUser = {
  username: jake.username,
  email: 'jake@example.test',
  bio: jake.bio,
  image: null,
  token: 'stub-token-not-a-real-jwt',
} satisfies StubUser;

export const dragonArticle = {
  slug: 'how-to-train-your-dragon',
  title: 'How to train your dragon',
  description: 'Ever wonder how?',
  body: [
    'Very carefully. **Bold** claims need _italic_ caveats.',
    '',
    '- feed it first',
    '- then introduce yourself',
    '',
    'Use `dragon.calm()` before anything else.',
  ].join('\n'),
  tagList: ['dragons', 'training'],
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  favorited: false,
  favoritesCount: 12,
  author: anna,
} satisfies StubArticle;

export const testingArticle = {
  slug: 'ten-things-i-learned-building-a-test-suite',
  title: 'Ten things I learned building a test suite',
  description: 'Mostly about deleting flaky tests.',
  body: 'Fixed data beats clever data.',
  tagList: ['testing'],
  createdAt: '2026-02-03T08:30:00.000Z',
  updatedAt: '2026-02-03T08:30:00.000Z',
  favorited: true,
  favoritesCount: 3,
  author: jake,
} satisfies StubArticle;

// A long title, no tags: checks how the article preview wraps.
export const longTitleArticle = {
  slug: 'a-very-long-title-that-wraps-onto-a-second-line',
  title: 'A very long title that wraps onto a second line to check how the preview lays out',
  description: 'Layout stress test.',
  body: 'Nothing to see here.',
  tagList: [],
  createdAt: '2026-03-21T17:45:00.000Z',
  updatedAt: '2026-03-21T17:45:00.000Z',
  favorited: false,
  favoritesCount: 0,
  author: anna,
} satisfies StubArticle;

export const articles: StubArticle[] = [dragonArticle, testingArticle, longTitleArticle];

export const tags = ['dragons', 'training', 'testing', 'playwright', 'welcome'];

export const dragonComments: StubComment[] = [
  {
    id: 1,
    body: 'Great article!',
    author: jake,
    createdAt: '2026-01-16T09:00:00.000Z',
    updatedAt: '2026-01-16T09:00:00.000Z',
  },
  {
    id: 2,
    body: 'Thanks — the calm() tip saved my afternoon.',
    author: anna,
    createdAt: '2026-01-17T12:15:00.000Z',
    updatedAt: '2026-01-17T12:15:00.000Z',
  },
];

/** `count` distinct articles, for exercising pagination. Fixed like everything above. */
export function articleSeries(count: number): StubArticle[] {
  return Array.from({ length: count }, (_, index) => ({
    ...dragonArticle,
    slug: `series-article-${index + 1}`,
    title: `Series article ${index + 1}`,
    tagList: [],
    favoritesCount: 0,
    author: anna,
  }));
}
