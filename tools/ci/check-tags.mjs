// @ts-check
// Fails when a test carries a tag outside the agreed vocabulary. Tag-based selection
// fails silently: a typo like `@smoek` doesn't error, the test just drops out of the
// smoke run. See docs/adr/0008-test-tiers-and-ci-triggers.md.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Playwright reports tags without the leading "@".
const ALLOWED_TAGS = new Set(['smoke', 'quarantine']);

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');

const listing = JSON.parse(
  execFileSync(process.execPath, [playwrightCli, 'test', '--list', '--reporter=json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);

/** @typedef {{ title: string, file: string, line: number, tags?: string[] }} Spec */
/** @typedef {{ specs?: Spec[], suites?: Suite[] }} Suite */

/** @param {Suite} suite @returns {Spec[]} */
const collectSpecs = (suite) => [
  ...(suite.specs ?? []),
  ...(suite.suites ?? []).flatMap(collectSpecs),
];

const specs = collectSpecs({ suites: listing.suites });
const unknown = specs.flatMap((spec) =>
  (spec.tags ?? [])
    .filter((tag) => !ALLOWED_TAGS.has(tag))
    .map((tag) => ({ tag, location: `${spec.file}:${spec.line}`, title: spec.title })),
);
const countTagged = (tag) => specs.filter((spec) => spec.tags?.includes(tag)).length;

console.log(
  `${specs.length} tests: ${countTagged('smoke')} @smoke, ${countTagged('quarantine')} @quarantine`,
);

let failed = false;

for (const { tag, location, title } of unknown) {
  failed = true;
  console.error(`Unknown tag @${tag} at ${location} ("${title}")`);
}
if (unknown.length > 0) {
  console.error(`Allowed tags: ${[...ALLOWED_TAGS].map((tag) => `@${tag}`).join(', ')}`);
}

if (countTagged('smoke') === 0) {
  failed = true;
  console.error('No @smoke tests found — the pull-request gate would run nothing.');
}

process.exit(failed ? 1 : 0);
