// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMatcher } from './match.mjs';
import { parseSchema } from './manifest.mjs';
import { baseSpec, sampleSchema } from './sample-schema.mjs';

const match = buildMatcher(parseSchema(sampleSchema(baseSpec)).values());
const keyOf = (/** @type {string} */ method, /** @type {string} */ path) =>
  match(method, path)?.key;

describe('buildMatcher', () => {
  it('maps a concrete path to its template', () => {
    assert.equal(keyOf('GET', '/api/things/42'), 'GET /api/things/{id}');
    assert.equal(keyOf('DELETE', '/api/things/abc-def'), 'DELETE /api/things/{id}');
  });

  it('prefers the literal path over a parameter that would also fit', () => {
    assert.equal(keyOf('GET', '/api/things/latest'), 'GET /api/things/latest');
  });

  it('is decided by method as well as path', () => {
    assert.equal(keyOf('POST', '/api/things'), 'POST /api/things');
    assert.equal(keyOf('PATCH', '/api/things'), undefined);
    assert.equal(keyOf('post', '/api/things'), 'POST /api/things');
  });

  it('does not match a different depth or an unknown path', () => {
    assert.equal(keyOf('GET', '/api/things/1/extra'), undefined);
    assert.equal(keyOf('GET', '/api/nothing'), undefined);
  });

  it('ignores a trailing slash', () => {
    assert.equal(keyOf('GET', '/api/things/'), 'GET /api/things');
  });
});
