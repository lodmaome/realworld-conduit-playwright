// @ts-check
// Adds this CI run to the flake history and renders the dashboard. Called by the publish
// step after it has restored the previous history from the gh-pages branch.
//
// Environment (all optional; the GITHUB_* ones are set by Actions):
//   FLAKE_RESULTS_DIR   where the reporter's part files are  (default: flake-results)
//   FLAKE_HISTORY_PATH  the history file                     (default: flake-history/flake-history.jsonl)
//   FLAKE_SITE_DIR      where flakes/index.html is written   (default: allure-report)
//   TIER                the tier that ran, for the record
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyse, appendEntry, summariseRun } from './analysis.mjs';
import { readHistory, readParts, writeHistory } from './history.mjs';
import { listTests } from './list-tests.mjs';
import { renderDashboard } from './render.mjs';

const env = process.env;
const resultsDir = env.FLAKE_RESULTS_DIR ?? 'flake-results';
const historyPath = env.FLAKE_HISTORY_PATH ?? 'flake-history/flake-history.jsonl';
const siteDir = env.FLAKE_SITE_DIR ?? 'allure-report';

const parts = readParts(resultsDir);
if (parts.length === 0) {
  console.error(`No flake results in ${resultsDir}/ — recording nothing.`);
  process.exit(1);
}

const repo = env.GITHUB_REPOSITORY;
const runId = env.GITHUB_RUN_ID ?? 'local';
const entry = summariseRun(parts, {
  id: runId,
  number: Number(env.GITHUB_RUN_NUMBER ?? 0),
  attempt: Number(env.GITHUB_RUN_ATTEMPT ?? 1),
  sha: env.GITHUB_SHA ?? '',
  ref: env.GITHUB_REF_NAME ?? '',
  event: env.GITHUB_EVENT_NAME ?? '',
  tier: env.TIER ?? '',
  at: new Date().toISOString(),
  url: repo ? `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repo}/actions/runs/${runId}` : '',
});

const history = appendEntry(readHistory(historyPath), entry);
writeHistory(historyPath, history);

const quarantinedIds = listTests()
  .filter((t) => t.tags.includes('quarantine'))
  .map((t) => t.id);
const analysis = analyse(history, { quarantinedIds });

mkdirSync(join(siteDir, 'flakes'), { recursive: true });
writeFileSync(
  join(siteDir, 'flakes', 'index.html'),
  renderDashboard(analysis, {
    adrUrl: repo
      ? `https://github.com/${repo}/blob/main/docs/adr/0012-flake-handling.md`
      : undefined,
  }),
);

const { totals } = entry;
console.log(
  `Flake history: ${history.length} run(s). This run: ${totals.flaky} flaky of ${totals.passed + totals.failed + totals.flaky} executed.`,
);
