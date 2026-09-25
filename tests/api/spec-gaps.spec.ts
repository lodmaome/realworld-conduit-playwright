import { expect, test } from '@playwright/test';
import {
  allOperations,
  declaredStatuses,
  presenceSchemas,
  specDeclaresBody,
  specRequires,
  supplementKeys,
} from '@api-client/contract';

// The published OpenAPI spec (api-client/openapi.json) is incomplete, and api-client/contract.ts
// makes up for that with labelled supplements. These tests pin what the spec lacks, as observed
// on 2026-09-25, so that when a backend bump improves it the tests fail and say which supplement
// to retire. No backend needed: they read the committed spec. Docs: ADR-0015.

const gap = (description: string) =>
  test.info().annotations.push({ type: 'known-issue', description });

test.describe('gaps in the published OpenAPI spec', () => {
  test('it declares only a 200 response for every operation', () => {
    gap(
      'The spec never declares 201, 204, 401, 403, 404, 409 or 422, all of which the backend sends.',
    );

    const declaringMore = allOperations()
      .map((operation) => ({ operation, statuses: declaredStatuses(operation) }))
      .filter(({ statuses }) => statuses.join() !== '200');

    expect(
      declaringMore,
      'the spec now declares more than 200 for these: revisit the supplements in contract.ts',
    ).toEqual([]);
  });

  test('it declares no response body for five operations that do return one or answer 204', () => {
    gap('Create user, article and comment, and delete article and comment, have no body schema.');

    const withoutBody = allOperations().filter((operation) => !specDeclaresBody(operation, 200));

    expect(withoutBody.sort()).toEqual([
      'DELETE /api/articles/{slug}',
      'DELETE /api/articles/{slug}/comments/{id}',
      'POST /api/articles',
      'POST /api/articles/{slug}/comments',
      'POST /api/users',
    ]);
  });

  test('every supplement in contract.ts is for something the spec still leaves out', () => {
    const redundant = supplementKeys().filter((key) => {
      const status = Number(key.slice(key.lastIndexOf(' ') + 1));
      return specDeclaresBody(key.slice(0, key.lastIndexOf(' ')), status);
    });

    expect(redundant, 'the spec now declares these: delete the supplements').toEqual([]);
  });

  test('it declares no required property on any schema', () => {
    gap('Every property is optional, so a response missing `token` would satisfy the spec alone.');

    const nowRequired = presenceSchemas().filter(specRequires);

    expect(
      nowRequired,
      'the spec now declares required properties here: drop them from observedPresence',
    ).toEqual([]);
  });
});
