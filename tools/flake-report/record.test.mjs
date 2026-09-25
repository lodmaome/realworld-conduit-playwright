// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPart, firstLine, testId } from './record.mjs';

/** A stand-in for Playwright's TestCase, with just what the recorder reads. */
function fakeTest({
  path = ['', 'ui', 'auth.spec.ts', 'login', 'signs in'],
  outcome = 'expected',
  results = [],
  annotations = [],
} = {}) {
  return { titlePath: () => path, outcome: () => outcome, results, annotations };
}
const attempt = (status, ...messages) => ({
  status,
  errors: messages.map((message) => ({ message })),
});

describe('firstLine', () => {
  it('drops terminal colour codes', () => {
    assert.equal(
      firstLine('\u001b[31mError: expect failed\u001b[39m\n more'),
      'Error: expect failed',
    );
  });
  it('skips leading blank lines', () => {
    assert.equal(firstLine('\n\n  Error: real message\nstack'), 'Error: real message');
  });
  it('truncates very long lines', () => {
    assert.equal(firstLine('x'.repeat(500)).length, 200);
  });
  it('copes with no message', () => {
    assert.equal(firstLine(undefined), '(no message)');
    assert.equal(firstLine(''), '(no message)');
  });
});

describe('testId', () => {
  it('joins project, file and titles, without the empty root', () => {
    assert.equal(testId(fakeTest()), 'ui › auth.spec.ts › login › signs in');
  });
  it('is the same on Windows and Linux', () => {
    const win = fakeTest({ path: ['', 'ui', 'ui\\auth.spec.ts', 'signs in'] });
    const linux = fakeTest({ path: ['', 'ui', 'ui/auth.spec.ts', 'signs in'] });
    assert.equal(testId(win), testId(linux));
  });
});

describe('buildPart', () => {
  const build = (...tests) =>
    buildPart({ allTests: () => tests }, new Date('2026-09-25T10:00:00Z'));

  it('maps Playwright outcomes to ours', () => {
    const { tests } = build(
      fakeTest({ path: ['', 'p', 'a'], outcome: 'expected' }),
      fakeTest({ path: ['', 'p', 'b'], outcome: 'unexpected' }),
      fakeTest({ path: ['', 'p', 'c'], outcome: 'flaky' }),
      fakeTest({ path: ['', 'p', 'd'], outcome: 'skipped' }),
    );
    assert.deepEqual(
      tests.map((t) => t.outcome),
      ['passed', 'failed', 'flaky', 'skipped'],
    );
  });

  it('records what went wrong on the attempts that failed, and only those', () => {
    const [flaky] = build(
      fakeTest({
        outcome: 'flaky',
        results: [attempt('failed', 'Error: timed out\nstack...'), attempt('passed')],
      }),
    ).tests;
    assert.equal(flaky?.attempts, 2);
    assert.deepEqual(flaky?.errors, ['Error: timed out']);
  });

  it('records quarantine metadata from the annotation', () => {
    const [t] = build(
      fakeTest({
        annotations: [{ type: 'quarantine', description: 'until 2026-12-01: slow runner' }],
      }),
    ).tests;
    assert.deepEqual(t?.quarantine, { until: '2026-12-01', reason: 'slow runner' });
  });

  it('flags a malformed quarantine annotation instead of dropping it', () => {
    const [t] = build(
      fakeTest({ annotations: [{ type: 'quarantine', description: 'flaky, fix later' }] }),
    ).tests;
    assert.equal(t?.quarantine?.malformed, true);
    assert.equal(t?.quarantine?.reason, 'flaky, fix later');
  });

  it('ignores annotations of other types', () => {
    const [t] = build(fakeTest({ annotations: [{ type: 'slow', description: 'x' }] })).tests;
    assert.equal(t?.quarantine, undefined);
  });

  it('stamps the part with its schema and start time', () => {
    const part = build();
    assert.equal(part.schema, 1);
    assert.equal(part.startedAt, '2026-09-25T10:00:00.000Z');
  });
});
