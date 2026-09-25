// @ts-check
// The two committed contract files must agree: schema.d.ts has to be exactly what
// openapi-typescript makes of openapi.json. If a pull request updates one and not the other,
// the tests would be written against types the runtime validator doesn't share.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import openapiTS, { astToString } from 'openapi-typescript';

describe('api-client contract files', () => {
  it('schema.d.ts is what openapi-typescript generates from openapi.json', async () => {
    const spec = JSON.parse(readFileSync('api-client/openapi.json', 'utf8'));
    const generated = astToString(await openapiTS(spec));
    const committed = readFileSync('api-client/schema.d.ts', 'utf8');

    // The generator's banner and trailing newline differ by invocation; the content must not.
    const body = (/** @type {string} */ text) => text.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '').trim();
    assert.equal(
      body(committed),
      body(generated),
      'schema.d.ts is out of step with openapi.json: run `npm run generate:api-types`',
    );
  });
});
