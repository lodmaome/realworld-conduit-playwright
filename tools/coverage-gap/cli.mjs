// @ts-check
// The PR coverage-gap flagger.
//
//   node tools/coverage-gap/cli.mjs --base origin/main     what a change added or altered
//   node tools/coverage-gap/cli.mjs --all                  the whole contract, no base needed
//
// It needs recorded hits (`npm run coverage:record`). Read docs/adr/0014 for what "changed" and
// "covered" mean here and what the answer does not tell you.
//
// Exit codes: 0 report produced (even with gaps, unless --fail-on-gap), 1 gaps found with
// --fail-on-gap, 2 the tool could not give an honest answer (no hits, a bad ref, a broken schema).
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { analyse } from './analysis.mjs';
import { diffManifests } from './diff.mjs';
import { readHitRecords } from './hits.mjs';
import { parseSchema } from './manifest.mjs';
import { backendPinChange } from './pin.mjs';
import { renderChangeReport, renderFullReport } from './render.mjs';

const SCHEMA = 'api-client/schema.d.ts';
const COMPOSE = 'docker/docker-compose.yml';

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    all: { type: 'boolean', default: false },
    hits: { type: 'string', default: 'endpoint-hits' },
    'real-projects': { type: 'string', default: 'api,ui' },
    // Projects whose direct API-client calls are the subject under test, not set-up.
    'api-projects': { type: 'string', default: 'api' },
    'fail-on-gap': { type: 'boolean', default: false },
    summary: { type: 'string', default: process.env.GITHUB_STEP_SUMMARY },
  },
});

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`coverage-gap: ${message}`);
  process.exit(2);
}

/** The file as it was at `ref`; undefined if it did not exist there. */
function atRef(/** @type {string} */ ref, /** @type {string} */ file) {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
}

if (!values.all && !values.base) fail('give --base <ref> (what to compare with), or --all.');

const headSchema = parseSchema(readFileSync(SCHEMA, 'utf8'));

let records;
try {
  records = readHitRecords(/** @type {string} */ (values.hits));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const analysis = analyse({
  operations: headSchema,
  records,
  realProjects: /** @type {string} */ (values['real-projects']).split(','),
  apiProjects: /** @type {string} */ (values['api-projects']).split(','),
});
// A recorder that silently recorded nothing would report every endpoint as a gap, or none.
if (analysis.passedRealTests === 0) {
  fail(
    `${values.hits}/ holds no passing real-backend test (${values['real-projects']}). The recording did not work, or every test failed.`,
  );
}

/** @type {string} */
let markdown;
let gapCount = 0;

if (values.all) {
  markdown = renderFullReport(headSchema, analysis);
} else {
  const base = /** @type {string} */ (values.base);
  const baseSchemaText = atRef(base, SCHEMA);
  if (baseSchemaText === undefined) fail(`cannot read ${SCHEMA} at "${base}". Is the ref fetched?`);
  const diff = diffManifests(parseSchema(/** @type {string} */ (baseSchemaText)), headSchema);
  const pinChange = backendPinChange(atRef(base, COMPOSE) ?? '', readFileSync(COMPOSE, 'utf8'));
  const report = renderChangeReport({
    diff,
    analysis,
    pinChange,
    schemaChanged: baseSchemaText !== readFileSync(SCHEMA, 'utf8'),
    base,
  });
  markdown = report.markdown;
  gapCount = report.gaps.length;

  // One annotation per thing to look at, so it shows on the PR without opening the summary.
  for (const operation of report.gaps) {
    console.log(
      `::warning title=Endpoint not reached by any test::${operation.key} changed and no test reaches it`,
    );
  }
  for (const operation of report.setupOnly) {
    console.log(
      `::warning title=Endpoint only used to set up::${operation.key} changed and no test drives it, real tests only use it to prepare data`,
    );
  }
  for (const operation of report.stubbedOnly) {
    console.log(
      `::warning title=Endpoint only stubbed::${operation.key} changed and only stubbed tests send it`,
    );
  }
  for (const warning of report.warnings)
    console.log(`::warning title=Schema not regenerated::${warning}`);
}

console.log(markdown);
if (values.summary) appendFileSync(values.summary, `${markdown}\n`);
process.exit(values['fail-on-gap'] && gapCount > 0 ? 1 : 0);
