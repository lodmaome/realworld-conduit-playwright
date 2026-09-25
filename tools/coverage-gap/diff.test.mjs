// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diffManifests } from './diff.mjs';
import { parseSchema } from './manifest.mjs';
import { baseSpec, sampleSchema } from './sample-schema.mjs';

const base = parseSchema(sampleSchema(baseSpec));
const keys = (/** @type {import('./manifest.mjs').Operation[]} */ list) => list.map((op) => op.key);

describe('diffManifests', () => {
  it('reports nothing for identical contracts', () => {
    const diff = diffManifests(base, parseSchema(sampleSchema(baseSpec)));
    assert.deepEqual(diff, { added: [], changed: [], removed: [] });
  });

  it('finds an added and a removed operation', () => {
    const head = parseSchema(
      sampleSchema({
        ...baseSpec,
        paths: {
          ...baseSpec.paths,
          '/api/things/{id}': { get: 'Thing' },
          '/api/things/{id}/tags': { get: 'ThingList' },
        },
      }),
    );
    const diff = diffManifests(base, head);
    assert.deepEqual(keys(diff.added), ['GET /api/things/{id}/tags']);
    assert.deepEqual(keys(diff.removed), ['DELETE /api/things/{id}']);
    assert.deepEqual(diff.changed, []);
  });

  it('finds an operation whose response changed', () => {
    const head = parseSchema(
      sampleSchema({
        ...baseSpec,
        schemas: { ...baseSpec.schemas, Owner: 'login: string; email: string' },
      }),
    );
    const diff = diffManifests(base, head);
    assert.equal(diff.added.length, 0);
    assert.ok(keys(diff.changed).includes('GET /api/owners'));
    assert.ok(keys(diff.changed).includes('GET /api/things'), 'reached through Thing -> Owner');
  });

  it('lists results in a stable order', () => {
    const head = parseSchema(
      sampleSchema({
        ...baseSpec,
        schemas: { ...baseSpec.schemas, Owner: 'login: string; email: string' },
      }),
    );
    const listed = keys(diffManifests(base, head).changed);
    assert.deepEqual(listed, [...listed].sort());
  });
});
