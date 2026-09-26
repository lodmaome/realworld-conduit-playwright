// @ts-check
// Checks whether the upstream app pins (ADR-0002) have fallen behind their upstream for long enough
// to look at. Reports only; it never changes a pin.
//
//   node tools/ci/pin-drift.mjs                       check both pins, 30-day threshold
//   node tools/ci/pin-drift.mjs --max-age-days 14
//   node tools/ci/pin-drift.mjs --pin backend=<sha>   check as if the backend were pinned there
//   node tools/ci/pin-drift.mjs --output report.md    also write the Markdown to a file
//
// Uses GITHUB_TOKEN (or GH_TOKEN) when set, for the rate limit; works without one for a few checks.
//
// Exit codes: 0 no pin needs a look, 3 at least one does, 2 the check itself failed (an API error,
// an unreadable file). A workflow should treat 2 as a failure and 3 as "open or update the issue".
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  DEFAULT_MAX_AGE_DAYS,
  attentionSummary,
  evaluatePin,
  needsAttention,
  readAppPins,
  renderDriftReport,
  withOverrides,
} from './pins.mjs';

/** @typedef {(path: string) => Promise<{ status: number, json: any }>} FetchJson */

/**
 * @param {import('./pins.mjs').AppPin[]} pins
 * @param {{ fetchJson: FetchJson, now: Date, maxAgeDays?: number }} options
 * @returns {Promise<import('./pins.mjs').PinResult[]>}
 */
export async function checkPins(pins, { fetchJson, now, maxAgeDays }) {
  /** @type {import('./pins.mjs').PinResult[]} */
  const results = [];
  for (const pin of pins) {
    const need = async (/** @type {string} */ path) => {
      const response = await fetchJson(path);
      if (response.status !== 200)
        throw new Error(`GitHub answered ${response.status} for ${path}`);
      return response.json;
    };

    const repo = await need(`/repos/${pin.repo}`);
    const tipCommit = await need(`/repos/${pin.repo}/commits/${repo.default_branch}`);
    const tip = { sha: tipCommit.sha, date: tipCommit.commit.committer.date };

    // GitHub says 404 or 422 for a SHA it doesn't have (a force-push removed it).
    const pinned = await fetchJson(`/repos/${pin.repo}/commits/${pin.sha}`);
    const pinExists = pinned.status === 200;
    if (!pinExists && pinned.status !== 404 && pinned.status !== 422) {
      throw new Error(`GitHub answered ${pinned.status} for /repos/${pin.repo}/commits/${pin.sha}`);
    }
    const compare = pinExists
      ? await need(`/repos/${pin.repo}/compare/${pin.sha}...${tip.sha}`)
      : undefined;

    results.push(
      evaluatePin({
        pin,
        defaultBranch: repo.default_branch,
        tip,
        pinDate: pinExists ? pinned.json.commit.committer.date : '',
        compare,
        now,
        maxAgeDays,
      }),
    );
  }
  return results;
}

/** @returns {FetchJson} */
function githubFetch() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return async (path) => {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'pin-drift-check',
        'x-github-api-version': '2022-11-28',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    return { status: response.status, json: await response.json().catch(() => undefined) };
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'max-age-days': { type: 'string', default: String(DEFAULT_MAX_AGE_DAYS) },
      pin: { type: 'string', multiple: true, default: [] },
      output: { type: 'string' },
      summary: { type: 'string', default: process.env.GITHUB_STEP_SUMMARY },
    },
  });
  const maxAgeDays = Number(values['max-age-days']);
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    throw new Error(`--max-age-days must be a number of days, got "${values['max-age-days']}"`);
  }

  const pins = withOverrides(
    readAppPins({
      compose: readFileSync('docker/docker-compose.yml', 'utf8'),
      frontendDockerfile: readFileSync('docker/frontend/Dockerfile', 'utf8'),
    }),
    values.pin ?? [],
  );

  const now = new Date();
  const results = await checkPins(pins, { fetchJson: githubFetch(), now, maxAgeDays });
  const repository = process.env.GITHUB_REPOSITORY;
  const docsBase = repository ? `https://github.com/${repository}/blob/main/` : '';
  const markdown = renderDriftReport(results, { now, maxAgeDays, docsBase });

  console.log(markdown);
  for (const r of results.filter(needsAttention)) {
    console.log(`::warning title=Upstream pin needs a look::${attentionSummary(r)}`);
  }
  if (values.output) writeFileSync(values.output, markdown);
  if (values.summary) appendFileSync(values.summary, `${markdown}\n`);
  process.exit(results.some(needsAttention) ? 3 : 0);
}

// Run only when executed directly, so the tests can import checkPins.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`pin-drift: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
}
