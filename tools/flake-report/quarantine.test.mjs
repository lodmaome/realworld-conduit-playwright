// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isExpired, parseQuarantine } from './quarantine.mjs';

describe('parseQuarantine', () => {
  it('reads the expiry and the reason', () => {
    assert.deepEqual(parseQuarantine('until 2026-11-15: flaky on slow runners, see #12'), {
      until: '2026-11-15',
      reason: 'flaky on slow runners, see #12',
    });
  });

  for (const [label, input] of [
    ['a missing prefix', '2026-11-15: reason'],
    ['a missing reason', 'until 2026-11-15:'],
    ['a blank reason', 'until 2026-11-15:    '],
    ['a slash-separated date', 'until 15/11/2026: reason'],
    ['undefined', undefined],
    ['an empty string', ''],
  ]) {
    it(`rejects ${label}`, () => assert.equal(parseQuarantine(/** @type {any} */ (input)), null));
  }

  it('rejects a date that does not exist instead of letting it roll over', () => {
    // new Date('2026-02-31') is March 3rd; accepting it would quietly extend a quarantine.
    assert.equal(parseQuarantine('until 2026-02-31: reason'), null);
    assert.equal(parseQuarantine('until 2026-13-01: reason'), null);
  });

  it('keeps a multi-line reason intact', () => {
    assert.equal(
      parseQuarantine('until 2026-11-15: line one\nline two')?.reason,
      'line one\nline two',
    );
  });
});

describe('isExpired', () => {
  it('is still in force for the whole of its last day', () => {
    assert.equal(isExpired('2026-11-15', new Date('2026-11-15T23:59:00Z')), false);
  });
  it('lapses once the day is over', () => {
    assert.equal(isExpired('2026-11-15', new Date('2026-11-16T00:00:01Z')), true);
  });
  it('is in force before the date', () => {
    assert.equal(isExpired('2026-11-15', new Date('2026-10-01T00:00:00Z')), false);
  });
});
