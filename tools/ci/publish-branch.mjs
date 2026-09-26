// @ts-check
// Which branches the report publisher may write to. The publisher force-pushes a single fresh
// commit to whatever branch it is given, so the name is checked here, in code, and not only in
// the workflow: a typo or a hostile input must not be able to name `main`.
//
// `gh-pages` is the real site and its flake history. `gh-pages-<suffix>` is a rehearsal branch:
// somewhere to run the whole publish path (report, history, dashboard, flake budget) without
// touching the real history. Pages does not serve those branches.

export const REAL_BRANCH = 'gh-pages';

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isPublishBranch(name) {
  return /^gh-pages(-[A-Za-z0-9][A-Za-z0-9._-]{0,60})?$/.test(name) && !name.includes('..');
}

/**
 * @param {string} name
 * @returns {string} the name, if it is allowed
 */
export function assertPublishBranch(name) {
  if (!isPublishBranch(name)) {
    throw new Error(
      `Refusing to publish to "${name}": the publisher force-pushes, so it only writes to ` +
        `"${REAL_BRANCH}" or a rehearsal branch named "${REAL_BRANCH}-<something>".`,
    );
  }
  return name;
}
