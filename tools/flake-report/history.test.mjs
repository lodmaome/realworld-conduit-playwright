// @ts-check
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { readHistory, readParts, writeHistory } from './history.mjs';

const dir = mkdtempSync(join(tmpdir(), 'flake-history-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

describe('readParts', () => {
  it('returns nothing for a directory that does not exist', () => {
    assert.deepEqual(readParts(join(dir, 'missing')), []);
  });

  it('reads part files in name order and ignores everything else', () => {
    const parts = join(dir, 'parts');
    mkdirSync(parts, { recursive: true });
    writeFileSync(join(parts, 'part-2.json'), '{"n":2}');
    writeFileSync(join(parts, 'part-1.json'), '{"n":1}');
    writeFileSync(join(parts, 'notes.txt'), 'not a part');
    writeFileSync(join(parts, 'other.json'), '{"n":99}');
    assert.deepEqual(readParts(parts), [{ n: 1 }, { n: 2 }]);
  });
});

describe('history file', () => {
  it('round-trips entries as one JSON object per line', () => {
    const path = join(dir, 'nested', 'h.jsonl');
    const entries = [
      { v: 1, n: 1 },
      { v: 1, n: 2 },
    ];
    writeHistory(path, /** @type {any} */ (entries));
    assert.deepEqual(readHistory(path), entries);
  });

  it('is empty when there is no file yet', () => {
    assert.deepEqual(readHistory(join(dir, 'never.jsonl')), []);
  });

  it('ignores blank lines', () => {
    const path = join(dir, 'blank.jsonl');
    writeFileSync(path, '{"a":1}\n\n{"a":2}\n\n');
    assert.equal(readHistory(path).length, 2);
  });

  it('refuses a corrupt line, naming it, instead of quietly dropping history', () => {
    const path = join(dir, 'corrupt.jsonl');
    writeFileSync(path, '{"a":1}\n{not json\n{"a":3}\n');
    assert.throws(() => readHistory(path), /corrupt\.jsonl:2 is not valid JSON/);
  });
});
