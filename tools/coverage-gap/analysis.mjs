// @ts-check
// Turns the endpoint hits recorded during a test run into "which operations does a test reach, and
// does a test drive them or only use them to get ready".
//
// What counts, and why:
//  - only tests that PASSED. A test that failed early may never have reached what it was written
//    to reach, and a retry that failed and then passed is counted once, by its passing attempt;
//  - real-backend projects (`api`, `ui`) reach the backend. A stubbed test (`ui-mocked`) sent its
//    request to a stub, so it says something about the frontend and nothing about the backend
//    endpoint. It is reported separately, as a weaker state, and never as coverage;
//  - among real tests, a request is DRIVEN when the test itself sent it, and SET-UP when a fixture
//    sent it to prepare the test. A request is set-up if the recorder flagged it (a factory, the
//    auth bootstrap), or if it came from the API client in a project whose subject is not the API:
//    a UI test's own API-client calls prepare data or read state back, and the UI is what it tests.
//    Only the `api` project's direct API-client calls are driven (`apiProjects`).
//
// "Driven" is not "verified": a test can drive an endpoint and assert nothing about the answer,
// and an endpoint the browser calls on page load is driven by a test that is looking at something
// else. What it does separate is a test that meant to exercise an endpoint from one that used it
// to get going. See docs/adr/0014.
import { buildMatcher } from './match.mjs';

/** @typedef {import('./manifest.mjs').Operation} Operation */

/**
 * One test attempt, as written by tests/support/endpoint-hits.ts. `setup` is absent unless a
 * fixture flagged the request as preparing the test.
 * @typedef {object} HitRecord
 * @property {string} project
 * @property {string} testId
 * @property {string} title
 * @property {string} status
 * @property {number} retry
 * @property {{ method: string, pathname: string, via: string, setup?: boolean }[]} hits
 */

/**
 * @typedef {object} OperationCoverage
 * @property {number} real       Distinct passing real-backend tests that reached it, either way.
 * @property {number} driven     Of those, the tests that drove it themselves.
 * @property {number} stubbed    Distinct passing stubbed tests that sent a request for it.
 * @property {string[]} via      How real tests reached it: `browser`, `apiClient`.
 * @property {string[]} examples Titles of up to three tests: the ones that drive it, else the ones that reach it.
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
 * @param {Iterable<string>} [input.apiProjects] Projects whose direct API-client calls are the
 *   subject under test. Default: `api`.
 * @returns {Analysis}
 */
export function analyse({ operations, records, realProjects, apiProjects = ['api'] }) {
  const real = new Set(realProjects);
  const apiSubject = new Set(apiProjects);
  const match = buildMatcher(operations.values());

  /** @typedef {{ real: Map<string, string>, driven: Map<string, string>, stubbed: Set<string>, via: Set<string> }} Seen */
  /** @type {Map<string, Seen>} */
  const seen = new Map();
  for (const key of operations.keys()) {
    seen.set(key, { real: new Map(), driven: new Map(), stubbed: new Set(), via: new Set() });
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
      const entry = /** @type {Seen} */ (seen.get(operation.key));
      if (!isReal) {
        entry.stubbed.add(record.testId);
        continue;
      }
      entry.real.set(record.testId, record.title);
      entry.via.add(hit.via);
      const sentByTest = hit.via === 'browser' || apiSubject.has(record.project);
      if (sentByTest && !hit.setup) entry.driven.set(record.testId, record.title);
    }
  }

  /** @type {Map<string, OperationCoverage>} */
  const coverage = new Map();
  for (const [key, entry] of seen) {
    const shown = entry.driven.size > 0 ? entry.driven : entry.real;
    coverage.set(key, {
      real: entry.real.size,
      driven: entry.driven.size,
      stubbed: entry.stubbed.size,
      via: [...entry.via].sort(),
      examples: [...shown.values()].sort().slice(0, 3),
    });
  }
  return { coverage, unmatched: [...unmatched].sort(), passedTests, passedRealTests };
}

/** @typedef {'covered' | 'only-setup' | 'only-stubbed' | 'gap'} CoverageStatus */

/**
 * `covered`: a real-backend test drives it. `only-setup`: real tests reach it, but only to get
 * ready. `only-stubbed`: only stubs send it. `gap`: nothing does.
 * @param {OperationCoverage} entry
 * @returns {CoverageStatus}
 */
export function statusOf(entry) {
  if (entry.driven > 0) return 'covered';
  if (entry.real > 0) return 'only-setup';
  return entry.stubbed > 0 ? 'only-stubbed' : 'gap';
}
