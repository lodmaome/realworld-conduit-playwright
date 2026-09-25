// @ts-check
// Builds the Allure report from ./allure-results into ./allure-report.
//
// `allure generate` does NOT clean an existing output directory: it leaves the old report
// in place (verified — same report id and timestamp after a re-run) while still appending
// to history. So the previous report is removed first, otherwise a "regenerated" report can
// silently be a stale one.
//
// It also strips Google Analytics from the generated page. Allure 3 hardcodes
// `analyticsEnable: true` in every report plugin's HTML template (no config or env switch),
// so a published report would send each visitor's page URL and browser details to Allure's
// analytics property. The report's own JavaScript makes no such calls, so removing the two
// tags in index.html is complete — and a scan fails the build if any reference survives, so
// a change to Allure's template can't quietly bring it back.
//
// ALLURE_HISTORY_PATH and ALLURE_REPORT_NAME are read by allurerc.mjs.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const resultsDir = process.argv[2] ?? 'allure-results';
const outputDir = 'allure-report';

if (!existsSync(resultsDir)) {
  console.error(`No ${resultsDir}/ directory — run some tests first.`);
  process.exit(1);
}

rmSync(outputDir, { recursive: true, force: true });

const allureCli = createRequire(import.meta.url).resolve('allure');
const { status } = spawnSync(process.execPath, [allureCli, 'generate', resultsDir], {
  stdio: 'inherit',
});

if (status !== 0) process.exit(status ?? 1);

const indexPath = join(outputDir, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`allure exited 0 but ${indexPath} was not produced`);
  process.exit(1);
}

// The tag that loads gtag.js, then the inline script that configures it.
const analyticsBlock =
  /<script[^>]*googletagmanager[^>]*><\/script>\s*<script>(?:(?!<\/script>)[\s\S])*gtag\((?:(?!<\/script>)[\s\S])*<\/script>/;
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace(analyticsBlock, ''));

const analyticsReference = /googletagmanager|google-analytics|G-[A-Z0-9]{8,}/;

/** @param {string} dir @returns {string[]} */
function filesWithAnalytics(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesWithAnalytics(path);
    const scannable = /\.(html|js|json)$/.test(entry.name);
    return scannable && analyticsReference.test(readFileSync(path, 'utf8')) ? [path] : [];
  });
}

const leaks = filesWithAnalytics(outputDir);
if (leaks.length > 0) {
  console.error(
    `Analytics reference still present in: ${leaks.join(', ')}\n` +
      "Allure's report template has probably changed — update the strip in tools/ci/generate-allure-report.mjs.",
  );
  process.exit(1);
}
