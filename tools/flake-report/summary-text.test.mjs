// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summariseRun } from './analysis.mjs';
import { annotations, summaryMarkdown } from './summary-text.mjs';

const run = {
  id: '1',
  number: 1,
  attempt: 1,
  sha: '',
  ref: '',
  event: '',
  tier: '',
  at: '',
  url: '',
};
const rec = (id, outcome, extra = {}) => ({
  id,
  outcome,
  attempts: outcome === 'flaky' ? 2 : 1,
  errors: [],
  ...extra,
});
const entryOf = (tests) => summariseRun([{ schema: 1, startedAt: '', tests }], run);

describe('summaryMarkdown', () => {
  it('says so when nothing flaked', () => {
    const md = summaryMarkdown(entryOf([rec('a', 'passed'), rec('b', 'passed')]));
    assert.match(md, /None: all 2 executed tests/);
    assert.doesNotMatch(md, /\| Test \|/);
  });

  it('lists each flaky test with its first failure, and the rate', () => {
    const md = summaryMarkdown(
      entryOf([
        rec('ui › a', 'flaky', { errors: ['Error: timed out'] }),
        rec('ui › b', 'passed'),
        rec('ui › c', 'passed'),
        rec('ui › d', 'passed'),
      ]),
    );
    assert.match(md, /\*\*1 of 4\*\*/);
    assert.match(md, /25\.0%/);
    assert.match(md, /\| ui › a \| 2 \| Error: timed out \|/);
    assert.match(md, /green because of the retry/);
  });

  it('keeps a pipe in an error from breaking the table', () => {
    const md = summaryMarkdown(entryOf([rec('ui › a', 'flaky', { errors: ['a | b'] })]));
    assert.match(md, /a \\\| b/);
  });

  it('mentions quarantined tests that ran', () => {
    const md = summaryMarkdown(
      entryOf([rec('q', 'flaky', { quarantine: { until: '2027-01-01', reason: 'r' } })]),
    );
    assert.match(md, /Quarantined tests run in this job: q \(flaky\)/);
  });
});

describe('annotations', () => {
  it('emits one warning per flaky test', () => {
    const lines = annotations(
      entryOf([rec('a', 'flaky', { errors: ['boom'] }), rec('b', 'passed')]),
    );
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? '', /^::warning title=Flaky test \(passed on retry\)::a — boom$/);
  });

  it('cannot be broken out of by newlines or percent signs in a test name', () => {
    const [line] = annotations(
      entryOf([rec('evil\n::error::injected 100%', 'flaky', { errors: ['x'] })]),
    );
    assert.doesNotMatch(line ?? '', /\n/);
    assert.match(line ?? '', /evil%0A::error::injected 100%25/);
  });

  it('emits nothing when nothing flaked', () => {
    assert.deepEqual(annotations(entryOf([rec('a', 'passed')])), []);
  });
});
