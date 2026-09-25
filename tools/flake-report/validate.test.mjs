// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateTests } from './validate.mjs';

const NOW = new Date('2026-09-25T12:00:00Z');

/** @param {Partial<import('./list-tests.mjs').ListedTest>} over */
const listed = (over = {}) => ({
  id: 'ui › ui/a.spec.ts › t',
  file: 'ui/a.spec.ts',
  line: 3,
  title: 't',
  project: 'ui',
  tags: [],
  annotations: [],
  ...over,
});
const smoke = listed({ title: 'smoke test', tags: ['smoke'] });
const quarantined = (description, over = {}) =>
  listed({
    tags: ['quarantine'],
    annotations: [{ type: 'quarantine', description }],
    ...over,
  });

describe('validateTests', () => {
  it('accepts a well-formed suite', () => {
    assert.deepEqual(
      validateTests([smoke, quarantined('until 2026-12-01: slow runner')], { now: NOW }),
      [],
    );
  });

  it('rejects an unknown tag, naming where it is', () => {
    const problems = validateTests([smoke, listed({ tags: ['smoek'] })], { now: NOW });
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? '', /Unknown tag @smoek at ui\/a\.spec\.ts:3/);
  });

  it('fails when nothing is tagged smoke', () => {
    assert.match(validateTests([listed()], { now: NOW })[0] ?? '', /No @smoke tests/);
  });

  describe('quarantine', () => {
    it('requires a reason and an expiry', () => {
      const problems = validateTests([smoke, listed({ tags: ['quarantine'] })], { now: NOW });
      assert.match(problems[0] ?? '', /without a reason and an expiry/);
    });

    it('rejects a malformed annotation', () => {
      const problems = validateTests([smoke, quarantined('flaky, fix later')], { now: NOW });
      assert.match(problems[0] ?? '', /Malformed quarantine/);
    });

    it('rejects an impossible date', () => {
      const problems = validateTests([smoke, quarantined('until 2026-02-31: reason')], {
        now: NOW,
      });
      assert.match(problems[0] ?? '', /Malformed quarantine/);
    });

    it('fails once the quarantine has expired, quoting the reason', () => {
      const problems = validateTests([smoke, quarantined('until 2026-09-24: slow runner')], {
        now: NOW,
      });
      assert.match(problems[0] ?? '', /expired on 2026-09-24/);
      assert.match(problems[0] ?? '', /slow runner/);
    });

    it('is still fine on the last day', () => {
      assert.deepEqual(
        validateTests([smoke, quarantined('until 2026-09-25: reason')], { now: NOW }),
        [],
      );
    });

    it('rejects an annotation with no tag, since the test would still gate', () => {
      const problems = validateTests(
        [
          smoke,
          listed({ annotations: [{ type: 'quarantine', description: 'until 2026-12-01: x' }] }),
        ],
        { now: NOW },
      );
      assert.match(problems[0] ?? '', /without the @quarantine tag/);
    });

    it('reports every problem, not just the first', () => {
      const problems = validateTests(
        [
          smoke,
          listed({ tags: ['smoek'] }),
          quarantined('bad'),
          quarantined('until 2020-01-01: old'),
        ],
        { now: NOW },
      );
      assert.equal(problems.length, 3);
    });
  });
});
