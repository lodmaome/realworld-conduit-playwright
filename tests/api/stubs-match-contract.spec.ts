import { expect, test } from '@playwright/test';
import { apiErrors, stubFor, type ApiMockConfig } from '../support/api-mock';
import { expectContract } from '../support/contract';
import {
  anna,
  articles,
  dragonArticle,
  dragonComments,
  jake,
  signedInUser,
  tags,
  testingArticle,
} from '../support/sample-data';

// The visual, a11y and mocked-UI suites run against stubs. A stub that drifts from what the
// backend really sends makes all three green for the wrong reason, so this checks the stub
// layer's own answers against the contract, with no backend. See ADR-0015.

const config: ApiMockConfig = {
  user: signedInUser,
  articles,
  feed: [testingArticle],
  tags,
  comments: { [dragonArticle.slug]: dragonComments },
  profiles: [anna, jake],
};

const answers: Array<{
  name: string;
  path: string;
  operation: string;
  status: number;
  config?: ApiMockConfig;
}> = [
  {
    name: 'the global feed',
    path: '/api/articles?limit=10&offset=0',
    operation: 'GET /api/articles',
    status: 200,
  },
  {
    name: 'a tag filter',
    path: '/api/articles?tag=dragons',
    operation: 'GET /api/articles',
    status: 200,
  },
  {
    name: 'Your Feed',
    path: '/api/articles/feed',
    operation: 'GET /api/articles/feed',
    status: 200,
  },
  {
    name: 'one article',
    path: `/api/articles/${dragonArticle.slug}`,
    operation: 'GET /api/articles/{slug}',
    status: 200,
  },
  {
    name: 'its comments',
    path: `/api/articles/${dragonArticle.slug}/comments`,
    operation: 'GET /api/articles/{slug}/comments',
    status: 200,
  },
  {
    name: 'a profile',
    path: '/api/profiles/anna',
    operation: 'GET /api/profiles/{username}',
    status: 200,
  },
  { name: 'the tags', path: '/api/tags', operation: 'GET /api/tags', status: 200 },
  { name: 'the current user', path: '/api/user', operation: 'GET /api/user', status: 200 },
  {
    name: 'an article that does not exist',
    path: '/api/articles/nope',
    operation: 'GET /api/articles/{slug}',
    status: 404,
  },
  {
    name: 'a profile that does not exist',
    path: '/api/profiles/nobody',
    operation: 'GET /api/profiles/{username}',
    status: 404,
  },
  {
    name: 'a visitor with no token',
    path: '/api/user',
    operation: 'GET /api/user',
    status: 401,
    config: { ...config, user: undefined },
  },
];

test.describe('the stub layer answers as the contract says', () => {
  for (const { name, path, operation, status, config: override } of answers) {
    test(`${name} (${status})`, () => {
      const stub = stubFor(override ?? config, new URL(path, 'http://localhost'));

      expect(stub, `the stub layer has no answer for ${path}`).toBeDefined();
      expect(stub?.status).toBe(status);
      expectContract(operation, { status: stub?.status ?? 0, body: stub?.body });
    });
  }

  test('the error body helper used by the mocked-UI overrides has the real error shape', () => {
    expectContract('POST /api/articles', {
      status: 422,
      body: apiErrors({ title: ["can't be blank"], body: ['is too short'] }),
    });
  });
});
