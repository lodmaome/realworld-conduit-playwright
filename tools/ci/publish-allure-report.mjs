// @ts-check
// Builds the Allure report with trend history and publishes it to a branch GitHub Pages
// serves. History lives in that branch as history.jsonl: it is read from there before
// generating and written back with the new report, so every run extends the trend.
//
// Why a git branch and not the deployed site itself: Pages sits behind a CDN that caches for
// minutes, so a run that fetched history.jsonl right after another run deployed could read
// the previous copy and silently drop that run from the trend. Git reads are consistent.
// The workflow serialises publishing (concurrency group), so two runs never race on the push.
//
// The branch is force-pushed as a single fresh commit each time, so the repository doesn't
// accumulate a copy of the report per run.
//
// Environment:
//   PUBLISH_REMOTE      git URL to publish to (in CI it carries the token; never printed)
//   PUBLISH_BRANCH      branch to publish to (default: gh-pages)
//   RESULTS_DIR         Allure results to build from (default: allure-results)
//   ALLURE_REPORT_NAME  report title, passed through to allurerc.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const remote = process.env.PUBLISH_REMOTE;
const branch = process.env.PUBLISH_BRANCH ?? 'gh-pages';
const resultsDir = process.env.RESULTS_DIR ?? 'allure-results';
const historyFile = 'allure-history/history.jsonl';

if (!remote) {
  console.error('PUBLISH_REMOTE is required');
  process.exit(1);
}

/** Runs git and returns stdout; on failure throws with any credential in the URL removed. */
function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const detail = `${error.stderr ?? ''}${error.message}`.replaceAll(/\/\/[^@/\s]+@/g, '//***@');
    // No `cause`: the original error embeds the remote URL, credential included, and Node
    // prints a cause when an error goes uncaught — which would undo the redaction above.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

const countLines = (file) =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).length : 0;

const work = mkdtempSync(join(tmpdir(), 'allure-publish-'));
try {
  // Read the previous history. `ls-remote` succeeds with no output when the branch simply
  // doesn't exist yet (the first publish), and fails on a real problem (auth, network) —
  // the two must not be confused, or a transient failure would silently reset the trend.
  const branchExists = git(['ls-remote', '--heads', remote, branch]).trim() !== '';
  mkdirSync('allure-history', { recursive: true });
  rmSync(historyFile, { force: true });

  if (branchExists) {
    const previous = join(work, 'previous');
    git(['clone', '--quiet', '--depth', '1', '--branch', branch, remote, previous]);
    if (existsSync(join(previous, 'history.jsonl'))) {
      copyFileSync(join(previous, 'history.jsonl'), historyFile);
    }
  }
  const before = countLines(historyFile);
  console.log(
    branchExists ? `Previous history: ${before} run(s)` : `No ${branch} branch yet — first publish`,
  );

  const generated = spawnSync(
    process.execPath,
    ['tools/ci/generate-allure-report.mjs', resultsDir],
    {
      stdio: 'inherit',
      env: { ...process.env, ALLURE_HISTORY_PATH: `./${historyFile}` },
    },
  );
  if (generated.status !== 0) throw new Error('report generation failed');

  // Don't publish a report whose history wasn't recorded: the next run would start the
  // trend over and nobody would notice.
  const after = countLines(historyFile);
  if (after <= before) {
    throw new Error(`history did not grow (${before} -> ${after}); refusing to publish`);
  }
  console.log(`History now: ${after} run(s)`);

  const site = join(work, 'site');
  cpSync('allure-report', site, { recursive: true });
  copyFileSync(historyFile, join(site, 'history.jsonl'));
  writeFileSync(join(site, '.nojekyll'), ''); // serve the report as-is, skip Jekyll processing

  const identity = [
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898282+github-actions[bot]@users.noreply.github.com',
  ];
  git(['init', '--quiet', '-b', branch], site);
  git(['add', '-A'], site);
  git(
    [
      ...identity,
      'commit',
      '--quiet',
      '-m',
      `Publish Allure report (${process.env.ALLURE_REPORT_NAME ?? 'local'})`,
    ],
    site,
  );
  git(['push', '--quiet', '--force', remote, `HEAD:refs/heads/${branch}`], site);
  console.log(`Published to ${branch}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
