// @ts-check
// The rules the test suite must satisfy about tags and quarantine. Pure, so they can be
// tested without running Playwright; check-tags feeds them the real list.
import {
  QUARANTINE_ANNOTATION,
  QUARANTINE_TAG,
  isExpired,
  parseQuarantine,
} from './quarantine.mjs';

/** Playwright reports tags without the leading "@". */
export const ALLOWED_TAGS = new Set(['smoke', QUARANTINE_TAG]);

/**
 * @param {import('./list-tests.mjs').ListedTest[]} tests
 * @param {{ now?: Date }} [options]
 * @returns {string[]} one message per problem; empty when everything is in order
 */
export function validateTests(tests, { now = new Date() } = {}) {
  /** @type {string[]} */
  const problems = [];

  for (const test of tests) {
    const where = `${test.file}:${test.line} ("${test.title}")`;

    for (const tag of test.tags) {
      if (!ALLOWED_TAGS.has(tag)) {
        problems.push(
          `Unknown tag @${tag} at ${where}. Allowed: ${[...ALLOWED_TAGS].map((t) => `@${t}`).join(', ')}`,
        );
      }
    }

    const tagged = test.tags.includes(QUARANTINE_TAG);
    const annotation = test.annotations.find((a) => a.type === QUARANTINE_ANNOTATION);

    if (tagged && !annotation) {
      problems.push(
        `@quarantine without a reason and an expiry at ${where}. Use quarantined('YYYY-MM-DD', 'why') from tests/support/quarantine.ts`,
      );
    } else if (annotation && !tagged) {
      problems.push(
        `Quarantine annotation without the @quarantine tag at ${where}: it would still run in the gating tiers`,
      );
    } else if (annotation) {
      const parsed = parseQuarantine(annotation.description);
      if (!parsed) {
        problems.push(
          `Malformed quarantine at ${where}: "${annotation.description ?? ''}". Expected "until YYYY-MM-DD: reason"`,
        );
      } else if (isExpired(parsed.until, now)) {
        problems.push(
          `Quarantine expired on ${parsed.until} at ${where} ("${parsed.reason}"). Fix the test, or extend the date in a reviewed change`,
        );
      }
    }
  }

  if (!tests.some((t) => t.tags.includes('smoke'))) {
    problems.push('No @smoke tests found — the pull-request gate would run nothing.');
  }
  return problems;
}
