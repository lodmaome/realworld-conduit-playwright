// @ts-check
// Turns a finished Playwright run into a flat, serialisable record. Pure functions over the
// reporter API's objects, so they can be tested with plain stand-ins.
import { QUARANTINE_ANNOTATION, parseQuarantine } from './quarantine.mjs';

/**
 * @typedef {'passed' | 'failed' | 'flaky' | 'skipped'} Outcome
 * @typedef {{
 *   id: string,
 *   outcome: Outcome,
 *   attempts: number,
 *   errors: string[],
 *   quarantine?: { until: string, reason: string, malformed?: boolean },
 * }} TestRecord
 * @typedef {{ schema: 1, startedAt: string, tests: TestRecord[] }} RunPart
 */

/** @type {Record<string, Outcome>} */
const OUTCOMES = { expected: 'passed', unexpected: 'failed', flaky: 'flaky', skipped: 'skipped' };

// eslint-disable-next-line no-control-regex -- matching terminal colour escapes is the point
const ANSI = /\u001b\[[0-9;]*m/g;

/** First meaningful line of an error, without colour codes: enough to recognise a failure. */
export function firstLine(message) {
  const line = (message ?? '')
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return (line ?? '(no message)').slice(0, 200);
}

/**
 * A stable, readable id: project, file and title path. Path separators are normalised so
 * the id is the same on Windows and Linux, otherwise history would split by OS.
 * @param {{ titlePath(): string[] }} test
 */
export function testId(test) {
  return test
    .titlePath()
    .filter(Boolean)
    .map((part) => part.replaceAll('\\', '/'))
    .join(' › ');
}

/**
 * @param {{ allTests(): any[] }} suite
 * @param {Date} startedAt
 * @returns {RunPart}
 */
export function buildPart(suite, startedAt) {
  const tests = suite.allTests().map((test) => {
    const outcome = OUTCOMES[test.outcome()] ?? 'failed';
    /** @type {TestRecord} */
    const record = {
      id: testId(test),
      outcome,
      attempts: test.results.length,
      // The errors of the attempts that failed — for a flaky test, what went wrong before
      // the retry passed; for a failed one, what kept going wrong.
      errors: test.results
        .filter((r) => r.status !== 'passed' && r.status !== 'skipped')
        .flatMap((r) => r.errors.map((e) => firstLine(e.message))),
    };

    const annotation = test.annotations.find((a) => a.type === QUARANTINE_ANNOTATION);
    if (annotation) {
      record.quarantine = parseQuarantine(annotation.description) ?? {
        until: '',
        reason: annotation.description ?? '',
        malformed: true,
      };
    }
    return record;
  });

  return { schema: 1, startedAt: startedAt.toISOString(), tests };
}
