// @ts-check
// Turns per-run records into history, and history into the numbers the dashboard and the
// flake budget need. Everything here is a pure function of its inputs.
import { isExpired } from './quarantine.mjs';

/** Runs of history kept. At roughly 5 KB a run this stays around half a megabyte. */
export const HISTORY_LIMIT = 90;
/** How many of a test's own most recent runs the budget and the offender list look at. */
export const WINDOW = 10;
/** Flakes within a test's last WINDOW runs that put it over budget. One flake is noise; retries handle it. */
export const FLAKE_LIMIT = 3;
/** Flakes within a test's last WINDOW runs worth watching, before it is over budget. */
export const WATCH_LIMIT = 2;
/** Consecutive passing observations before a quarantined test is a candidate to release. */
export const RELEASE_STREAK = 7;

/**
 * @typedef {import('./record.mjs').RunPart} RunPart
 * @typedef {import('./record.mjs').Outcome} Outcome
 * @typedef {{ id: string, number: number, attempt: number, sha: string, ref: string,
 *   event: string, tier: string, at: string, url: string }} RunInfo
 * @typedef {{ passed: number, failed: number, flaky: number, skipped: number }} Totals
 * @typedef {{
 *   v: 1,
 *   run: RunInfo,
 *   totals: Totals,
 *   tests: Record<string, Outcome>,
 *   flaky: { id: string, attempts: number, errors: string[] }[],
 *   quarantined: { id: string, outcome: Outcome, until: string, reason: string }[],
 * }} HistoryEntry
 */

/**
 * Merges the parts of one CI run (one per Playwright invocation) into a single entry.
 * Quarantined tests are recorded separately and left out of the totals: they run outside
 * the gating tiers, so counting them would make the flake rate depend on the tier.
 * @param {RunPart[]} parts
 * @param {RunInfo} run
 * @returns {HistoryEntry}
 */
export function summariseRun(parts, run) {
  /** @type {Map<string, import('./record.mjs').TestRecord>} */
  const byId = new Map();
  for (const part of parts) for (const test of part.tests) byId.set(test.id, test);

  /** @type {HistoryEntry} */
  const entry = {
    v: 1,
    run,
    totals: { passed: 0, failed: 0, flaky: 0, skipped: 0 },
    tests: {},
    flaky: [],
    quarantined: [],
  };

  for (const test of byId.values()) {
    if (test.quarantine) {
      entry.quarantined.push({
        id: test.id,
        outcome: test.outcome,
        until: test.quarantine.until,
        reason: test.quarantine.reason,
      });
      continue;
    }
    entry.tests[test.id] = test.outcome;
    entry.totals[test.outcome] += 1;
    if (test.outcome === 'flaky') {
      entry.flaky.push({ id: test.id, attempts: test.attempts, errors: test.errors });
    }
  }
  return entry;
}

/** Share of executed tests that were flaky. Skipped tests didn't execute, so they don't count. */
export function flakeRate(totals) {
  const executed = totals.passed + totals.failed + totals.flaky;
  return executed === 0 ? 0 : totals.flaky / executed;
}

/**
 * Appends an entry, replacing any earlier entry for the same run attempt (a re-run of a
 * workflow must not count twice), and keeps the most recent HISTORY_LIMIT.
 * @param {HistoryEntry[]} history
 * @param {HistoryEntry} entry
 */
export function appendEntry(history, entry) {
  const key = (e) => `${e.run.id}-${e.run.attempt}`;
  return [...history.filter((e) => key(e) !== key(entry)), entry].slice(-HISTORY_LIMIT);
}

/**
 * @param {HistoryEntry[]} history
 * @param {{ now?: Date, quarantinedIds?: Iterable<string> }} [options]
 *   quarantinedIds: tests quarantined in the code today. Their past flakes stay in history,
 *   but they are already handled, so they must not keep failing the budget.
 */
export function analyse(history, { now = new Date(), quarantinedIds = [] } = {}) {
  const exempt = new Set(quarantinedIds);
  const recent = history.slice(-WINDOW);

  // Each test is judged on its own last WINDOW observations, not on the last WINDOW runs.
  // The tiers run different tests: the visual and a11y suites only run in the nightly full
  // tier, so within the last ten runs of main they appear once or twice. Counting runs would
  // make the budget structurally blind to exactly those tests.
  /** @type {Map<string, { number: number, outcome: Outcome, errors: string[] }[]>} */
  const observations = new Map();
  for (const entry of history) {
    for (const [id, outcome] of Object.entries(entry.tests)) {
      const list = observations.get(id) ?? [];
      list.push({
        number: entry.run.number,
        outcome,
        errors: outcome === 'flaky' ? (entry.flaky.find((f) => f.id === id)?.errors ?? []) : [],
      });
      observations.set(id, list);
    }
  }

  const stats = [];
  for (const [id, all] of observations) {
    const last = all.slice(-WINDOW);
    const flakes = last.filter((o) => o.outcome === 'flaky');
    if (flakes.length === 0) continue;
    const latestFlake = flakes[flakes.length - 1];
    stats.push({
      id,
      ran: last.length,
      flaky: flakes.length,
      failed: last.filter((o) => o.outcome === 'failed').length,
      lastFlakyRun: latestFlake?.number ?? 0,
      lastErrors: latestFlake?.errors ?? [],
    });
  }

  const offenders = stats
    .map((s) => ({
      ...s,
      level: exempt.has(s.id)
        ? /** @type {const} */ ('quarantined')
        : s.flaky >= FLAKE_LIMIT
          ? /** @type {const} */ ('over')
          : s.flaky >= WATCH_LIMIT
            ? /** @type {const} */ ('watch')
            : /** @type {const} */ ('seen'),
    }))
    .sort((a, b) => b.flaky - a.flaky || a.id.localeCompare(b.id));

  const series = history.map((e) => ({
    number: e.run.number,
    at: e.run.at,
    tier: e.run.tier,
    url: e.run.url,
    flaky: e.totals.flaky,
    executed: e.totals.passed + e.totals.failed + e.totals.flaky,
    rate: flakeRate(e.totals),
  }));

  /** @type {Map<string, { id: string, until: string, reason: string, outcomes: Outcome[] }>} */
  const quarantine = new Map();
  for (const entry of history) {
    for (const q of entry.quarantined) {
      const item = quarantine.get(q.id) ?? {
        id: q.id,
        until: q.until,
        reason: q.reason,
        outcomes: [],
      };
      item.until = q.until;
      item.reason = q.reason;
      item.outcomes.push(q.outcome);
      quarantine.set(q.id, item);
    }
  }
  const quarantined = [...quarantine.values()]
    .map((q) => {
      let streak = 0;
      for (let i = q.outcomes.length - 1; i >= 0 && q.outcomes[i] === 'passed'; i--) streak++;
      return {
        id: q.id,
        until: q.until,
        reason: q.reason,
        observations: q.outcomes.length,
        passStreak: streak,
        expired: q.until !== '' && isExpired(q.until, now),
        releaseCandidate: streak >= RELEASE_STREAK,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    window: recent.length,
    series,
    offenders,
    quarantined,
    violations: offenders.filter((o) => o.level === 'over'),
    latest: history.at(-1),
  };
}
