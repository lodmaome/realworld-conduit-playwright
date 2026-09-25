// @ts-check
// The flake budget: fails when a test that isn't quarantined has flaked FLAKE_LIMIT times in
// the last WINDOW runs. Retries keep CI green through the odd flake, but a test that needs
// them that often is unreliable, and this is what stops that being normal.
// Runs after the report is published, so the dashboard is there to explain the failure.
import { FLAKE_LIMIT, WINDOW, WATCH_LIMIT, analyse } from './analysis.mjs';
import { readHistory } from './history.mjs';
import { listTests } from './list-tests.mjs';

const historyPath = process.env.FLAKE_HISTORY_PATH ?? 'flake-history/flake-history.jsonl';
const history = readHistory(historyPath);

const quarantinedIds = listTests()
  .filter((t) => t.tags.includes('quarantine'))
  .map((t) => t.id);
const { violations, offenders } = analyse(history, { quarantinedIds });

for (const o of offenders.filter((o) => o.level === 'watch')) {
  console.log(
    `::notice title=Flaky test to watch::${o.id} flaked ${o.flaky} of its last ${o.ran} runs (budget: ${FLAKE_LIMIT})`,
  );
}

if (violations.length === 0) {
  console.log(
    `Flake budget OK: no test flaked ${FLAKE_LIMIT}+ times in its last ${WINDOW} runs (watching at ${WATCH_LIMIT}+).`,
  );
  process.exit(0);
}

for (const v of violations) {
  console.error(
    `::error title=Over the flake budget::${v.id} flaked ${v.flaky} of its last ${v.ran} runs (limit ${FLAKE_LIMIT} in ${WINDOW}). Fix it, or quarantine it with a reason and an expiry.`,
  );
}
process.exit(1);
