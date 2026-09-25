// @ts-check
// Reports the flaky tests of the run that just finished: annotations on the workflow run and
// a block in the job summary, so a retry that saved a red run is visible instead of silent.
// Never fails the job — it only reports; the budget check decides what is too many.
import { appendFileSync } from 'node:fs';
import { summariseRun } from './analysis.mjs';
import { readParts } from './history.mjs';
import { annotations, summaryMarkdown } from './summary-text.mjs';

const parts = readParts(process.env.FLAKE_RESULTS_DIR ?? 'flake-results');
if (parts.length === 0) {
  console.log('No flake results found; nothing to report.');
  process.exit(0);
}

const entry = summariseRun(parts, {
  id: '',
  number: 0,
  attempt: 1,
  sha: '',
  ref: '',
  event: '',
  tier: '',
  at: '',
  url: '',
});
const markdown = summaryMarkdown(entry);

console.log(markdown);
annotations(entry).forEach((line) => console.log(line));
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
