// @ts-check
// Turns the endpoint hits recorded during a test run into "which operations does a test reach".
//
// What counts, and why:
//  - only tests that PASSED. A test that failed early may never have reached what it was written
//    to reach, and a retry that failed and then passed is counted once, by its passing attempt;
//  - real-backend projects (`api`, `ui`) are "covered". A stubbed test (`ui-mocked`) sent its
//    request to a stub, so it says something about the frontend and nothing about the backend
//    endpoint. It is reported separately, as a weaker state, not counted as coverage.
//
// "Reached" is not "verified": a test that only registers a user as set-up reaches `POST
// /api/users` without asserting anything about it. The report says so; see docs/adr/0014.
import { buildMatcher } from './match.mjs';

/** @typedef {import('./manifest.mjs').Operation} Operation */

/**
 * One test attempt, as written by tests/support/endpoint-hits.ts.
 * @typedef {object} HitRecord
 * @property {string} project
 * @property {string} testId
 * @property {string} title
 * @property {string} status
 * @property {number} retry
 * @property {{ method: string, pathname: string, via: string }[]} hits
 */

/**
 * @typedef {object} OperationCoverage
 * @property {number} real       Distinct passing real-backend tests that reached it.
 * @property {number} stubbed    Distinct passing stubbed tests that sent a request for it.
 * @property {string[]} via      How real tests reached it: `browser`, `apiClient`.
 * @property {string[]} examples Titles of up to three real tests that reached it.
 */

/**
 * @typedef {object} Analysis
 * @property {Map<string, OperationCoverage>} coverage  Every operation, hit or not.
 * @property {string[]} unmatched     Requests that fit no declared operation, `METHOD path`.
 * @property {number} passedTests     Passing test attempts read.
 * @property {number} passedRealTests Of those, in real-backend projects.
 */

/**
 * @param {object} input
 * @param {Map<string, Operation>} input.operations
 * @param {HitRecord[]} input.records
 * @param {Iterable<string>} input.realProjects
 * @returns {Analysis}
 */
export function analyse({ operations, records, realProjects }) {
  const real = new Set(realProjects);
  const match = buildMatcher(operations.values());

  /** @type {Map<string, { real: Set<string>, stubbed: Set<string>, via: Set<string>, titles: Map<string, string> }>} */
  const seen = new Map();
  for (const key of operations.keys()) {
    seen.set(key, { real: new Set(), stubbed: new Set(), via: new Set(), titles: new Map() });
  }

  const unmatched = new Set();
  let passedTests = 0;
  let passedRealTests = 0;

  for (const record of records) {
    if (record.status !== 'passed') continue;
    passedTests += 1;
    const isReal = real.has(record.project);
    if (isReal) passedRealTests += 1;

    for (const hit of record.hits) {
      const operation = match(hit.method, hit.pathname);
      if (!operation) {
        unmatched.add(`${hit.method.toUpperCase()} ${hit.pathname}`);
        continue;
      }
      const entry = /** @type {NonNullable<ReturnType<typeof seen.get>>} */ (
        seen.get(operation.key)
      );
      if (isReal) {
        entry.real.add(record.testId);
        entry.via.add(hit.via);
        entry.titles.set(record.testId, record.title);
      } else {
        entry.stubbed.add(record.testId);
      }
    }
  }

  /** @type {Map<string, OperationCoverage>} */
  const coverage = new Map();
  for (const [key, entry] of seen) {
    coverage.set(key, {
      real: entry.real.size,
      stubbed: entry.stubbed.size,
      via: [...entry.via].sort(),
      examples: [...entry.titles.values()].sort().slice(0, 3),
    });
  }
  return { coverage, unmatched: [...unmatched].sort(), passedTests, passedRealTests };
}

/** @typedef {'covered' | 'only-stubbed' | 'gap'} CoverageStatus */

/** @param {OperationCoverage} entry @returns {CoverageStatus} */
export function statusOf(entry) {
  if (entry.real > 0) return 'covered';
  return entry.stubbed > 0 ? 'only-stubbed' : 'gap';
}
