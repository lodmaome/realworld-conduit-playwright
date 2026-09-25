// @ts-check
// Reading and writing the files the flake tooling works with: the per-invocation parts the
// reporter writes, and the history file (JSON Lines, one run per line) kept in gh-pages.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * @param {string} dir
 * @returns {import('./record.mjs').RunPart[]} in the order they were written
 */
export function readParts(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^part-.*\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

/**
 * A corrupt line throws rather than being skipped: quietly dropping history would look
 * exactly like a healthy run, and the trend would shrink with nobody noticing.
 * @param {string} path
 * @returns {import('./analysis.mjs').HistoryEntry[]}
 */
export function readHistory(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => line !== '')
    .map(({ line, number }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${number} is not valid JSON (${error.message})`, { cause: error });
      }
    });
}

/** @param {string} path @param {import('./analysis.mjs').HistoryEntry[]} entries */
export function writeHistory(path, entries) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
}
