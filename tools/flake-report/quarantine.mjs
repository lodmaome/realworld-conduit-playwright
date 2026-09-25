// @ts-check
// The quarantine metadata a test carries: a `@quarantine` tag, plus an annotation of type
// "quarantine" whose description is `until YYYY-MM-DD: <reason>`. The reason and the expiry
// live on the test itself, so a quarantine can't exist without saying why and until when.
// Shared by the reporter (to record it), check-tags (to enforce it) and the dashboard.

export const QUARANTINE_ANNOTATION = 'quarantine';
export const QUARANTINE_TAG = 'quarantine';

const FORMAT = /^until (\d{4}-\d{2}-\d{2}): (\S.*)$/s;

/**
 * @param {string | undefined} description
 * @returns {{ until: string, reason: string } | null} null when malformed or not a real date
 */
export function parseQuarantine(description) {
  const match = FORMAT.exec(description ?? '');
  if (!match) return null;
  const [, until, reason] = /** @type {[string, string, string]} */ (match);
  const date = new Date(`${until}T00:00:00Z`);
  // Rejects 2026-02-31, which Date would otherwise roll over into March.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== until) return null;
  return { until, reason: reason.trim() };
}

/** A quarantine lapses at the end of its `until` day (UTC), not the start. */
export function isExpired(until, now = new Date()) {
  return now.getTime() > new Date(`${until}T23:59:59.999Z`).getTime();
}
