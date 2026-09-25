// @ts-check
// Reads the per-test hit files that tests/support/endpoint-hits.ts writes.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** @typedef {import('./analysis.mjs').HitRecord} HitRecord */

/**
 * @param {string} dir
 * @returns {HitRecord[]}
 */
export function readHitRecords(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(
      `No endpoint hits in ${dir}/. Record them first: npm run coverage:record (it runs the api, ` +
        'ui and ui-mocked suites with recording switched on).',
    );
  }
  /** @type {HitRecord[]} */
  const records = [];
  for (const project of readdirSync(dir)) {
    const projectDir = join(dir, project);
    if (!statSync(projectDir).isDirectory()) continue;
    for (const name of readdirSync(projectDir)) {
      if (!name.endsWith('.json')) continue;
      const parsed = JSON.parse(readFileSync(join(projectDir, name), 'utf8'));
      if (parsed.version !== 1 || !Array.isArray(parsed.hits)) {
        throw new Error(`${join(projectDir, name)}: not a version 1 endpoint-hits file`);
      }
      records.push(parsed);
    }
  }
  return records;
}
