// @ts-check
// Pin drift: how far the upstream app commits pinned in this repository (ADR-0002) have fallen
// behind their upstream, and whether that is long enough to look at.
//
// ADR-0002 pins the backend and frontend to commits on purpose: a bump must be reviewed for API
// and DOM changes, so this only REPORTS. It exists because the same ADR names the risk that a pin
// becomes accidentally permanent. New upstream commits are not drift; commits that have gone
// unpicked for a while are.
//
// Pure functions only: reading the files, calling GitHub and printing are in pin-drift.mjs, so
// this can be tested with plain data.

/**
 * @typedef {object} AppPin
 * @property {'backend' | 'frontend'} name
 * @property {string} repo   `owner/name` on GitHub.
 * @property {string} sha    The pinned commit.
 */

/** The parts of GitHub's compare response used here (base = the pin, head = the upstream tip). */
/**
 * @typedef {object} Compare
 * @property {string} status       `identical`, `ahead`, `behind` or `diverged`.
 * @property {number} ahead_by     Commits upstream has that the pin lacks.
 * @property {number} behind_by    Commits the pin has that upstream's tip lacks (history rewritten).
 * @property {string} [html_url]
 * @property {{ sha: string, commit: { message: string, committer: { date: string } } }[]} [commits]  Oldest first.
 * @property {{ filename: string }[]} [files]
 */

/**
 * @typedef {'current' | 'recent' | 'drifted' | 'diverged' | 'missing'} DriftState
 *   current: identical to the tip. recent: behind, but the oldest missing commit is fresh.
 *   drifted: the oldest missing commit is older than the threshold. diverged: the pin is not an
 *   ancestor of the tip (upstream rewrote history). missing: upstream no longer has the commit.
 */

/**
 * @typedef {object} PinResult
 * @property {AppPin} pin
 * @property {DriftState} state
 * @property {string} defaultBranch
 * @property {string} tipSha
 * @property {string} tipDate       ISO date of the upstream tip, or ''.
 * @property {string} pinDate       ISO date of the pinned commit, or '' when it can't be found.
 * @property {number} behind        Commits upstream has that the pin lacks.
 * @property {number | undefined} oldestMissingDays  Age of the oldest unpicked commit.
 * @property {string[]} subjects    Newest-first subjects of unpicked commits, capped.
 * @property {{ area: string, files: number }[]} areas  Where the changes are, biggest first.
 * @property {string} compareUrl
 */

export const DEFAULT_MAX_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUBJECTS_SHOWN = 10;
const AREAS_SHOWN = 6;

const SHA = '([0-9a-f]{7,40})';

/**
 * The two upstream pins, from the files that hold them: the backend as a git build context in the
 * compose file, the frontend as the `FRONTEND_REF` build argument plus the repository its
 * Dockerfile clones.
 * @param {{ compose: string, frontendDockerfile: string }} files
 * @returns {AppPin[]}
 */
export function readAppPins({ compose, frontendDockerfile }) {
  const backend = compose.match(new RegExp(`github\\.com/([^/\\s]+/[^/\\s]+?)\\.git#${SHA}`));
  if (!backend)
    throw new Error(
      'No backend pin (a `github.com/<repo>.git#<sha>` build context) in the compose file.',
    );

  const ref = compose.match(new RegExp(`FRONTEND_REF:\\s*${SHA}`));
  if (!ref) throw new Error('No frontend pin (`FRONTEND_REF: <sha>`) in the compose file.');
  const clone = frontendDockerfile.match(
    /git clone https:\/\/github\.com\/([^/\s]+\/[^/\s]+?)\.git/,
  );
  if (!clone)
    throw new Error('No `git clone https://github.com/<repo>.git` in the frontend Dockerfile.');

  return [
    {
      name: 'backend',
      repo: /** @type {string} */ (backend[1]),
      sha: /** @type {string} */ (backend[2]),
    },
    {
      name: 'frontend',
      repo: /** @type {string} */ (clone[1]),
      sha: /** @type {string} */ (ref[1]),
    },
  ];
}

/**
 * Replace pins for a run: `backend=<sha>` or `frontend=<sha>`. For checking a candidate, and for
 * exercising the drift path when the real pins are current.
 * @param {AppPin[]} pins
 * @param {string[]} overrides
 * @returns {AppPin[]}
 */
export function withOverrides(pins, overrides) {
  const byName = new Map(pins.map((pin) => [pin.name, pin]));
  for (const override of overrides) {
    const [name, sha] = override.split('=');
    const pin = byName.get(/** @type {'backend' | 'frontend'} */ (name));
    if (!pin || !sha || !new RegExp(`^${SHA}$`).test(sha)) {
      throw new Error(`Bad --pin "${override}": expected backend=<sha> or frontend=<sha>.`);
    }
    byName.set(pin.name, { ...pin, sha });
  }
  return [...byName.values()];
}

/**
 * @param {object} input
 * @param {AppPin} input.pin
 * @param {string} input.defaultBranch
 * @param {{ sha: string, date: string }} input.tip
 * @param {string} input.pinDate                 '' when the pinned commit no longer exists upstream.
 * @param {Compare | undefined} input.compare    Undefined when the commit no longer exists upstream.
 * @param {Date} input.now
 * @param {number} [input.maxAgeDays]
 * @returns {PinResult}
 */
export function evaluatePin({
  pin,
  defaultBranch,
  tip,
  pinDate,
  compare,
  now,
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
}) {
  const base = {
    pin,
    defaultBranch,
    tipSha: tip.sha,
    tipDate: tip.date,
    pinDate,
    compareUrl: `https://github.com/${pin.repo}/compare/${pin.sha}...${tip.sha}`,
  };
  if (!compare) {
    return {
      ...base,
      state: 'missing',
      behind: 0,
      oldestMissingDays: undefined,
      subjects: [],
      areas: [],
    };
  }

  const commits = compare.commits ?? [];
  const oldest = commits[0]?.commit.committer.date;
  const oldestMissingDays = oldest
    ? Math.floor((now.getTime() - Date.parse(oldest)) / DAY_MS)
    : undefined;

  /** @type {DriftState} */
  let state = 'current';
  if (compare.behind_by > 0) state = 'diverged';
  else if (compare.ahead_by > 0) {
    state =
      oldestMissingDays !== undefined && oldestMissingDays > maxAgeDays ? 'drifted' : 'recent';
  }

  return {
    ...base,
    state,
    behind: compare.ahead_by,
    oldestMissingDays,
    subjects: commits
      .slice()
      .reverse()
      .slice(0, SUBJECTS_SHOWN)
      .map(
        (c) =>
          `${c.sha.slice(0, 7)} ${c.commit.committer.date.slice(0, 10)} ${c.commit.message.split('\n')[0]}`,
      ),
    areas: areasOf(compare.files ?? []),
  };
}

/** Where the unpicked changes are, by the first two path segments. @param {{ filename: string }[]} files */
function areasOf(files) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const { filename } of files) {
    const parts = filename.split('/');
    const area = parts.length > 2 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? filename);
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts]
    .map(([area, count]) => ({ area, files: count }))
    .sort((a, b) => b.files - a.files || (a.area < b.area ? -1 : a.area > b.area ? 1 : 0))
    .slice(0, AREAS_SHOWN);
}

/**
 * One line saying why a pin needs a look, for an annotation.
 * @param {PinResult} result
 */
export function attentionSummary(result) {
  const who = `${result.pin.name} (${result.pin.repo})`;
  switch (result.state) {
    case 'drifted':
      return `${who}: ${result.behind} upstream commits unpicked, the oldest ${result.oldestMissingDays} days old`;
    case 'diverged':
      return `${who}: the pin is not an ancestor of the upstream tip (history rewritten)`;
    case 'missing':
      return `${who}: the pinned commit no longer exists upstream`;
    default:
      return `${who}: ${result.state}`;
  }
}

/** A pin that needs a person to look at it. @param {PinResult} result */
export const needsAttention = (result) =>
  result.state === 'drifted' || result.state === 'diverged' || result.state === 'missing';

const STATE_TEXT = {
  current: 'current',
  recent: 'behind, recently',
  drifted: 'drifted',
  diverged: 'history rewritten',
  missing: 'commit not found upstream',
};

const short = (/** @type {string} */ sha) => sha.slice(0, 7);
const day = (/** @type {string} */ iso) => (iso ? iso.slice(0, 10) : 'unknown');

/**
 * @param {PinResult[]} results
 * @param {{ now: Date, maxAgeDays?: number, docsBase?: string }} options
 *   `docsBase` prefixes the links into this repository (an issue body can't resolve relative ones).
 * @returns {string} Markdown.
 */
export function renderDriftReport(
  results,
  { now, maxAgeDays = DEFAULT_MAX_AGE_DAYS, docsBase = '' },
) {
  const out = [
    '## Upstream pins',
    '',
    `Checked ${now.toISOString().slice(0, 10)}. A pin is flagged when upstream has commits it lacks and the ` +
      `oldest of them is more than ${maxAgeDays} days old, so a pin can't quietly become permanent ` +
      `([ADR-0002](${docsBase}docs/adr/0002-pin-upstream-app-versions.md)). This only reports; a bump is a reviewed change.`,
    '',
    '| App | Repository | Pinned | Upstream tip | Commits behind | Oldest unpicked | State |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    out.push(
      `| ${r.pin.name} | \`${r.pin.repo}\` | \`${short(r.pin.sha)}\` (${day(r.pinDate)}) | ` +
        `\`${short(r.tipSha)}\` (${day(r.tipDate)}) | ${r.behind} | ` +
        `${r.oldestMissingDays === undefined ? '—' : `${r.oldestMissingDays} days`} | ${STATE_TEXT[r.state]} |`,
    );
  }
  out.push('');

  const attention = results.filter(needsAttention);
  if (attention.length === 0) {
    const behind = results.filter((r) => r.state === 'recent');
    out.push(
      behind.length === 0
        ? 'Every pin is at its upstream tip.'
        : `${behind.map((r) => r.pin.name).join(' and ')} ${behind.length === 1 ? 'is' : 'are'} behind, but only by ` +
            'recent commits: not drift yet.',
      '',
    );
    return out.join('\n');
  }

  for (const r of attention) {
    out.push(`### ${r.pin.name}: ${STATE_TEXT[r.state]}`, '');
    if (r.state === 'missing') {
      out.push(
        `Upstream \`${r.pin.repo}\` no longer has commit \`${short(r.pin.sha)}\` (force-pushed or deleted). ` +
          'The build will fail the next time it needs that commit. Pick a commit from upstream and bump the pin.',
        '',
      );
      continue;
    }
    if (r.state === 'diverged') {
      out.push(
        `\`${short(r.pin.sha)}\` is not an ancestor of the upstream tip \`${short(r.tipSha)}\`: upstream rewrote ` +
          'its history, or the pin is on another branch. Compare, then choose a commit to pin.',
        '',
      );
    } else {
      out.push(
        `Upstream is **${r.behind} commit${r.behind === 1 ? '' : 's'}** ahead of the pin, and the oldest of them ` +
          `is ${r.oldestMissingDays} days old.`,
        '',
      );
    }
    out.push(`[Compare on GitHub](${r.compareUrl})`, '');
    if (r.areas.length > 0) {
      out.push(
        `Where the changes are: ${r.areas.map((a) => `\`${a.area}\` (${a.files})`).join(', ')}.`,
        '',
      );
    }
    if (r.subjects.length > 0) {
      out.push(
        'Newest commits:',
        '',
        ...r.subjects.map((s) => `- \`${s.slice(0, 7)}\`${s.slice(7)}`),
        '',
      );
    }
  }
  out.push(
    `To bump, follow [the runbook](${docsBase}docs/maintenance.md#the-upstream-frontend-or-backend-pin): read the changes, ` +
      'regenerate the API types, and run the full tier.',
    '',
  );
  return out.join('\n');
}
