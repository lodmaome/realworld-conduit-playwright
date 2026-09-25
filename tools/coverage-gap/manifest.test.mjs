// @ts-check
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parseSchema } from './manifest.mjs';
import { baseSpec, sampleSchema } from './sample-schema.mjs';

const keys = (/** @type {string} */ text) => [...parseSchema(text).keys()];
const fingerprints = (/** @type {string} */ text) =>
  Object.fromEntries([...parseSchema(text)].map(([key, op]) => [key, op.fingerprint]));

describe('parseSchema', () => {
  it('lists every declared operation as METHOD path, skipping `never` methods', () => {
    assert.deepEqual(keys(sampleSchema(baseSpec)).sort(), [
      'DELETE /api/things/{id}',
      'GET /api/owners',
      'GET /api/things',
      'GET /api/things/latest',
      'GET /api/things/{id}',
      'POST /api/things',
    ]);
  });

  it('reads the real schema in this repository', () => {
    const real = parseSchema(readFileSync('api-client/schema.d.ts', 'utf8'));
    assert.ok(real.size >= 19, `expected the backend's 19 operations, read ${real.size}`);
    assert.ok(real.has('POST /api/users/login'));
    assert.ok(real.has('GET /api/articles/feed'));
  });

  it('gives the same fingerprint to the same schema, however it is formatted', () => {
    const text = sampleSchema(baseSpec);
    assert.deepEqual(fingerprints(text), fingerprints(text.replace(/ {4}/g, '\t')));
  });

  it('does not treat a reworded description as a contract change', () => {
    assert.deepEqual(
      fingerprints(sampleSchema(baseSpec)),
      fingerprints(sampleSchema({ ...baseSpec, comment: 'The thing was found' })),
    );
  });

  it('changes only the operations that use a schema when that schema changes, through nesting', () => {
    const before = fingerprints(sampleSchema(baseSpec));
    // Owner is used by Thing, which is used by ThingList: three hops from the operations.
    const after = fingerprints(
      sampleSchema({
        ...baseSpec,
        schemas: { ...baseSpec.schemas, Owner: 'login: string; email: string' },
      }),
    );
    const changed = Object.keys(after).filter((key) => after[key] !== before[key]);
    assert.deepEqual(changed.sort(), [
      'DELETE /api/things/{id}',
      'GET /api/owners',
      'GET /api/things',
      'GET /api/things/latest',
      'GET /api/things/{id}',
      'POST /api/things',
    ]);
  });

  it('leaves an operation alone when only an unrelated schema changes', () => {
    const before = fingerprints(sampleSchema(baseSpec));
    const after = fingerprints(
      sampleSchema({
        ...baseSpec,
        schemas: {
          ...baseSpec.schemas,
          ThingList: 'things: components["schemas"]["Thing"][]; total: number',
        },
      }),
    );
    const changed = Object.keys(after).filter((key) => after[key] !== before[key]);
    assert.deepEqual(changed, ['GET /api/things']);
  });

  it('survives a schema that refers to itself', () => {
    const text = sampleSchema({
      paths: { '/api/tree': { get: 'Node' } },
      schemas: { Node: 'children: components["schemas"]["Node"][]' },
    });
    assert.deepEqual(keys(text), ['GET /api/tree']);
  });

  it('refuses a file that is not an openapi-typescript schema', () => {
    assert.throws(() => parseSchema('export const nothing = 1;'), /No `paths` interface/);
  });
});
