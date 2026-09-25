// @ts-check
// What changed in the API contract between two manifests.

/** @typedef {import('./manifest.mjs').Operation} Operation */

/**
 * @typedef {object} ContractDiff
 * @property {Operation[]} added
 * @property {Operation[]} changed  The head's version of each operation whose contract differs.
 * @property {Operation[]} removed  The base's version.
 */

/**
 * Order by key in plain code-unit order. `String#localeCompare` would depend on the machine's
 * locale, and a report that lists its rows differently on a laptop and in CI is one nobody can diff.
 * @param {Operation} a
 * @param {Operation} b
 */
export const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * @param {Map<string, Operation>} base
 * @param {Map<string, Operation>} head
 * @returns {ContractDiff}
 */
export function diffManifests(base, head) {
  /** @type {ContractDiff} */
  const diff = { added: [], changed: [], removed: [] };
  for (const [key, operation] of head) {
    const before = base.get(key);
    if (!before) diff.added.push(operation);
    else if (before.fingerprint !== operation.fingerprint) diff.changed.push(operation);
  }
  for (const [key, operation] of base) {
    if (!head.has(key)) diff.removed.push(operation);
  }
  diff.added.sort(byKey);
  diff.changed.sort(byKey);
  diff.removed.sort(byKey);
  return diff;
}
