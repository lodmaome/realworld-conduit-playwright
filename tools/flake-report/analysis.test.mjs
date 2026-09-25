// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FLAKE_LIMIT,
  HISTORY_LIMIT,
  RELEASE_STREAK,
  WATCH_LIMIT,
  WINDOW,
  analyse,
  appendEntry,
  flakeRate,
  summariseRun,
} from './analysis.mjs';

/** @param {number} n @param {Partial<import('./analysis.mjs').RunInfo>} [over] */
const run = (n, over = {}) => ({
  id: String(1000 + n),
  number: n,
  attempt: 1,
  sha: 'abc',
  ref: 'main',
  event: 'push',
  tier: 'regression',
  at: `2026-09-${String(10 + (n % 15)).padStart(2, '0')}T03:00:00Z`,
  url: `https://example.test/runs/${n}`,
  ...over,
});

/** A record as the reporter would write it. */
const rec = (id, outcome, extra = {}) => ({
  id,
  outcome,
  attempts: outcome === 'flaky' ? 2 : 1,
  errors: [],
  ...extra,
});

/** @param {number} n @param {Array<ReturnType<typeof rec>>} tests */
const entry = (n, tests, over) => summariseRun([{ schema: 1, startedAt: '', tests }], run(n, over));

describe('summariseRun', () => {
  it('counts outcomes and merges the parts of one run', () => {
    const e = summariseRun(
      [
        { schema: 1, startedAt: '', tests: [rec('ui › a', 'passed'), rec('ui › b', 'flaky')] },
        {
          schema: 1,
          startedAt: '',
          tests: [rec('a11y › c', 'failed'), rec('a11y › d', 'skipped')],
        },
      ],
      run(1),
    );
    assert.deepEqual(e.totals, { passed: 1, failed: 1, flaky: 1, skipped: 1 });
    assert.equal(Object.keys(e.tests).length, 4);
    assert.deepEqual(
      e.flaky.map((f) => f.id),
      ['ui › b'],
    );
  });

  it('keeps quarantined tests out of the totals but records them', () => {
    const e = entry(1, [
      rec('ui › ok', 'passed'),
      rec('ui › q', 'flaky', { quarantine: { until: '2026-12-01', reason: 'slow runner' } }),
    ]);
    assert.deepEqual(e.totals, { passed: 1, failed: 0, flaky: 0, skipped: 0 });
    assert.equal(e.tests['ui › q'], undefined);
    assert.deepEqual(e.quarantined, [
      { id: 'ui › q', outcome: 'flaky', until: '2026-12-01', reason: 'slow runner' },
    ]);
  });

  it('lets the later part win when a test appears twice', () => {
    const e = summariseRun(
      [
        { schema: 1, startedAt: '', tests: [rec('ui › a', 'failed')] },
        { schema: 1, startedAt: '', tests: [rec('ui › a', 'passed')] },
      ],
      run(1),
    );
    assert.equal(e.tests['ui › a'], 'passed');
    assert.equal(e.totals.failed, 0);
  });
});

describe('flakeRate', () => {
  it('is the share of executed tests that were flaky, ignoring skipped', () => {
    assert.equal(flakeRate({ passed: 8, failed: 1, flaky: 1, skipped: 50 }), 0.1);
  });
  it('is 0, not NaN, when nothing executed', () => {
    assert.equal(flakeRate({ passed: 0, failed: 0, flaky: 0, skipped: 3 }), 0);
  });
});

describe('appendEntry', () => {
  it('replaces an earlier entry for the same run attempt instead of counting it twice', () => {
    const first = entry(5, [rec('a', 'passed')]);
    const rerun = entry(5, [rec('a', 'flaky')]);
    const history = appendEntry([first], rerun);
    assert.equal(history.length, 1);
    assert.equal(history[0]?.tests['a'], 'flaky');
  });
  it('keeps a new attempt of the same run as a separate entry', () => {
    const a1 = entry(5, [rec('a', 'passed')]);
    const a2 = entry(5, [rec('a', 'passed')], { attempt: 2 });
    assert.equal(appendEntry([a1], a2).length, 2);
  });
  it(`keeps only the latest ${HISTORY_LIMIT} runs`, () => {
    let history = [];
    for (let n = 1; n <= HISTORY_LIMIT + 5; n++)
      history = appendEntry(history, entry(n, [rec('a', 'passed')]));
    assert.equal(history.length, HISTORY_LIMIT);
    assert.equal(history[0]?.run.number, 6);
  });
});

describe('analyse: the flake budget', () => {
  const flakyRuns = (count, id = 'ui › shaky') => {
    /** @type {ReturnType<typeof entry>[]} */
    const history = [];
    for (let n = 1; n <= WINDOW; n++) {
      history.push(
        entry(n, [rec('ui › steady', 'passed'), rec(id, n <= count ? 'flaky' : 'passed')]),
      );
    }
    return history;
  };

  it('does not count a single flake against the budget', () => {
    const result = analyse(flakyRuns(1));
    assert.equal(result.violations.length, 0);
    assert.equal(result.offenders[0]?.level, 'seen');
  });

  it(`flags ${WATCH_LIMIT} flakes in the window as worth watching`, () => {
    const result = analyse(flakyRuns(WATCH_LIMIT));
    assert.equal(result.offenders[0]?.level, 'watch');
    assert.equal(result.violations.length, 0);
  });

  it(`puts a test over budget at ${FLAKE_LIMIT} flakes in the window`, () => {
    const result = analyse(flakyRuns(FLAKE_LIMIT));
    assert.deepEqual(
      result.violations.map((v) => v.id),
      ['ui › shaky'],
    );
    assert.equal(result.violations[0]?.flaky, FLAKE_LIMIT);
    assert.equal(result.violations[0]?.ran, WINDOW);
  });

  it('only looks at the window: old flakes age out', () => {
    const history = [...flakyRuns(FLAKE_LIMIT)];
    for (let n = WINDOW + 1; n <= WINDOW * 2; n++)
      history.push(entry(n, [rec('ui › shaky', 'passed')]));
    assert.equal(analyse(history).violations.length, 0);
  });

  it('judges a test on its own last runs, so one that only runs nightly can still go over budget', () => {
    // A nightly runs every third run. The visual test flakes on nightlies 12, 21 and 30: three
    // times in its last ten observations, but spread over 19 runs, so only two of the three fall
    // inside the last ten *runs*. A window counted in runs would call this merely "watch".
    const history = [];
    for (let n = 1; n <= 30; n++) {
      const tests = [rec('ui › always', 'passed')];
      if (n % 3 === 0)
        tests.push(rec('visual › nightly only', [12, 21, 30].includes(n) ? 'flaky' : 'passed'));
      history.push(entry(n, tests));
    }
    const result = analyse(history);
    assert.deepEqual(
      result.violations.map((v) => v.id),
      ['visual › nightly only'],
    );
    assert.equal(result.violations[0]?.ran, WINDOW);
  });

  it('exempts a test that is quarantined in the code, however many flakes are in history', () => {
    const result = analyse(flakyRuns(WINDOW), { quarantinedIds: ['ui › shaky'] });
    assert.equal(result.violations.length, 0);
    assert.equal(result.offenders[0]?.level, 'quarantined');
  });

  it('does not treat a plain failure as a flake', () => {
    const history = [];
    for (let n = 1; n <= WINDOW; n++) history.push(entry(n, [rec('ui › broken', 'failed')]));
    const result = analyse(history);
    assert.equal(result.offenders.length, 0);
    assert.equal(result.violations.length, 0);
  });

  it('reports the most recent flake errors', () => {
    const history = [
      entry(1, [rec('ui › x', 'flaky', { errors: ['old error'] })]),
      entry(2, [rec('ui › x', 'flaky', { errors: ['new error'] })]),
    ];
    assert.deepEqual(analyse(history).offenders[0]?.lastErrors, ['new error']);
  });

  it('handles an empty history', () => {
    const result = analyse([]);
    assert.equal(result.latest, undefined);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.series, []);
  });
});

describe('analyse: quarantine', () => {
  const q = (outcome, until = '2026-12-01') =>
    rec('ui › q', outcome, { quarantine: { until, reason: 'slow runner' } });

  it('counts the trailing run of passes, and resets on a failure', () => {
    const history = [
      entry(1, [q('passed')]),
      entry(2, [q('failed')]),
      entry(3, [q('passed')]),
      entry(4, [q('passed')]),
    ];
    const [item] = analyse(history).quarantined;
    assert.equal(item?.passStreak, 2);
    assert.equal(item?.observations, 4);
    assert.equal(item?.releaseCandidate, false);
  });

  it(`marks a candidate for release after ${RELEASE_STREAK} straight passes`, () => {
    const history = Array.from({ length: RELEASE_STREAK }, (_, i) => entry(i + 1, [q('passed')]));
    assert.equal(analyse(history).quarantined[0]?.releaseCandidate, true);
  });

  it('flags a quarantine whose date has passed', () => {
    const now = new Date('2026-12-02T00:00:00Z');
    assert.equal(
      analyse([entry(1, [q('passed', '2026-12-01')])], { now }).quarantined[0]?.expired,
      true,
    );
    assert.equal(
      analyse([entry(1, [q('passed', '2026-12-01')])], { now: new Date('2026-12-01T12:00:00Z') })
        .quarantined[0]?.expired,
      false,
    );
  });
});
