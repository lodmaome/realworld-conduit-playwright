// @ts-check
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readHitRecords } from './hits.mjs';

/** @type {string} */
let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'endpoint-hits-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const write = (
  /** @type {string} */ project,
  /** @type {string} */ name,
  /** @type {unknown} */ body,
) => {
  mkdirSync(join(dir, project), { recursive: true });
  writeFileSync(join(dir, project, name), JSON.stringify(body));
};
const file = {
  version: 1,
  project: 'ui',
  testId: 't',
  title: 'x',
  status: 'passed',
  retry: 0,
  hits: [],
};

describe('readHitRecords', () => {
  it('reads every per-test file under every project', () => {
    write('ui', 'a.json', file);
    write('api', 'b.json', { ...file, project: 'api', testId: 'u' });
    assert.deepEqual(
      readHitRecords(dir)
        .map((r) => r.testId)
        .sort(),
      ['t', 'u'],
    );
  });

  it('says how to record when there is nothing to read', () => {
    assert.throws(() => readHitRecords(join(dir, 'missing')), /npm run coverage:record/);
  });

  it('refuses a file it does not understand rather than guessing', () => {
    write('ui', 'a.json', { version: 2, hits: [] });
    assert.throws(() => readHitRecords(dir), /not a version 1/);
  });

  it('ignores files that are not JSON hit files', () => {
    write('ui', 'a.json', file);
    writeFileSync(join(dir, 'ui', 'notes.txt'), 'not json');
    assert.equal(readHitRecords(dir).length, 1);
  });
});
