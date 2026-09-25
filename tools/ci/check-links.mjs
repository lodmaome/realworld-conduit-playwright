// @ts-check
// Fails on broken relative links between the project's Markdown files. Documentation that
// points at moved files or renamed sections is worse than none. Runs in the static CI job.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { findBrokenLinks } from './links.mjs';

const SKIP = new Set([
  'node_modules',
  '.git',
  'allure-report',
  'allure-results',
  'test-results',
  'playwright-report',
]);

/** @param {string} dir @returns {string[]} */
function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const path = dir === '.' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

const files = new Map(markdownFiles('.').map((path) => [path, readFileSync(path, 'utf8')]));
const problems = findBrokenLinks(files, (path) => existsSync(path));

problems.forEach((problem) => console.error(problem));
console.log(`Checked ${files.size} Markdown files: ${problems.length} broken link(s)`);
process.exit(problems.length > 0 ? 1 : 0);
