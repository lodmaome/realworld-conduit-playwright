// @ts-check
// Maps a request the browser or the API client actually sent (`GET /api/articles/abc`) back to
// the operation the contract declares it as (`GET /api/articles/{slug}`).
//
// When two templates both fit, the one with more literal segments wins: `/api/articles/feed`
// also fits `/api/articles/{slug}`, and it is the literal path the backend serves.

/** @typedef {import('./manifest.mjs').Operation} Operation */

const segmentsOf = (/** @type {string} */ path) => path.split('/').filter(Boolean);

/**
 * @param {Iterable<Operation>} operations
 * @returns {(method: string, pathname: string) => Operation | undefined}
 */
export function buildMatcher(operations) {
  const candidates = [...operations].map((operation) => {
    const segments = segmentsOf(operation.path);
    return {
      operation,
      segments,
      literals: segments.filter((segment) => !segment.startsWith('{')).length,
    };
  });

  return (method, pathname) => {
    const requested = segmentsOf(pathname);
    let best;
    for (const candidate of candidates) {
      if (candidate.operation.method !== method.toUpperCase()) continue;
      if (candidate.segments.length !== requested.length) continue;
      const fits = candidate.segments.every(
        (segment, index) => segment.startsWith('{') || segment === requested[index],
      );
      if (fits && (!best || candidate.literals > best.literals)) best = candidate;
    }
    return best?.operation;
  };
}
