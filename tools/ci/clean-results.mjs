// @ts-check
// Removes test output so the next run starts clean. The Allure reporter appends to
// allure-results/ rather than replacing it — deliberate in CI, where the three runs of
// `test:full` merge into one report — so locally, results from every earlier run pile up
// and a generated report would show all of them. allure-history/ is left alone.
import { rmSync } from 'node:fs';

for (const dir of ['allure-results', 'allure-report', 'test-results', 'playwright-report']) {
  rmSync(dir, { recursive: true, force: true });
  console.log(`removed ${dir}/`);
}
