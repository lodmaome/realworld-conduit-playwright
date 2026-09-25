// @ts-check
// Lists every test Playwright would run, with the id the flake reporter uses for it, so
// what the code says (tags, quarantine annotations) can be matched with what history
// recorded. Runs `playwright test --list`, so it needs no application running.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

/**
 * @typedef {{
 *   id: string, file: string, line: number, title: string, project: string,
 *   tags: string[], annotations: { type: string, description?: string }[],
 * }} ListedTest
 */

/** @returns {ListedTest[]} */
export function listTests() {
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const listing = JSON.parse(
    execFileSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );

  /** @type {ListedTest[]} */
  const tests = [];
  // The top-level suites are files; their child suites are `describe` blocks. The id is
  // project › file › describes › title, which is what the reporter builds from titlePath().
  const walk = (suite, describes) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        tests.push({
          id: [test.projectName, spec.file, ...describes, spec.title].join(' › '),
          file: spec.file,
          line: spec.line,
          title: spec.title,
          project: test.projectName,
          tags: spec.tags ?? [],
          annotations: test.annotations ?? [],
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...describes, child.title]);
  };
  for (const fileSuite of listing.suites ?? []) walk(fileSuite, []);
  return tests;
}
