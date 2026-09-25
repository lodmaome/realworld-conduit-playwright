// @ts-check
// The report: Markdown for the job summary, plus one annotation per endpoint that needs attention.
import { statusOf } from './analysis.mjs';
import { byKey } from './diff.mjs';

/** @typedef {import('./manifest.mjs').Operation} Operation */
/** @typedef {import('./diff.mjs').ContractDiff} ContractDiff */
/** @typedef {import('./analysis.mjs').Analysis} Analysis */
/** @typedef {import('./analysis.mjs').OperationCoverage} OperationCoverage */

const LABEL = {
  covered: 'covered',
  'only-setup': 'only used to set up',
  'only-stubbed': 'only stubbed',
  gap: 'no test reaches it',
};

const cell = (/** @type {string} */ text) => text.replace(/\|/g, '\\|');
const code = (/** @type {string} */ text) => `\`${cell(text)}\``;
const listOf = (/** @type {Operation[]} */ operations) =>
  operations.map((op) => code(op.key)).join(', ');

/** @param {Analysis} analysis @param {Operation} operation @returns {OperationCoverage} */
const coverageOf = (analysis, operation) =>
  /** @type {OperationCoverage} */ (analysis.coverage.get(operation.key));

/**
 * @param {Operation[]} operations
 * @param {Analysis} analysis
 * @param {(operation: Operation) => string} [note]
 */
function table(operations, analysis, note) {
  const header = [
    'Endpoint',
    note ? 'Change' : '',
    'Driven by tests',
    'Set-up only',
    'Stubbed',
    'Status',
  ];
  const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
  for (const operation of operations) {
    const entry = coverageOf(analysis, operation);
    const via = entry.via.length > 0 ? ` (${entry.via.join(', ')})` : '';
    lines.push(
      `| ${[
        code(operation.key),
        note ? note(operation) : '',
        entry.driven > 0 ? `${entry.driven}${via}` : '0',
        String(entry.real - entry.driven),
        String(entry.stubbed),
        LABEL[statusOf(entry)],
      ].join(' | ')} |`,
    );
  }
  return lines.join('\n');
}

/**
 * @param {object} input
 * @param {ContractDiff} input.diff
 * @param {Analysis} input.analysis
 * @param {{ from: string, to: string } | undefined} input.pinChange  The backend pin, if it moved.
 * @param {boolean} input.schemaChanged  Whether `schema.d.ts` differs at all.
 * @param {string} input.base
 * @returns {{ markdown: string, gaps: Operation[], setupOnly: Operation[], stubbedOnly: Operation[], warnings: string[] }}
 */
export function renderChangeReport({ diff, analysis, pinChange, schemaChanged, base }) {
  const changed = [...diff.added, ...diff.changed].sort(byKey);
  const kind = new Map([
    ...diff.added.map((op) => /** @type {const} */ ([op.key, 'added'])),
    ...diff.changed.map((op) => /** @type {const} */ ([op.key, 'changed'])),
  ]);
  const withStatus = (/** @type {import('./analysis.mjs').CoverageStatus} */ status) =>
    changed.filter((op) => statusOf(coverageOf(analysis, op)) === status);
  const gaps = withStatus('gap');
  const setupOnly = withStatus('only-setup');
  const stubbedOnly = withStatus('only-stubbed');

  /** @type {string[]} */
  const warnings = [];
  if (pinChange && !schemaChanged) {
    warnings.push(
      `The backend pin moved (${pinChange.from.slice(0, 7)} to ${pinChange.to.slice(0, 7)}) but ` +
        '`api-client/schema.d.ts` did not. Run `npm run generate:api-types`: without it this ' +
        'report cannot see what the new backend changed.',
    );
  }

  const out = [`## API coverage gaps`, '', `Contract compared with \`${base}\`.`, ''];
  for (const warning of warnings) out.push(`> **Warning:** ${warning}`, '');

  if (changed.length === 0 && diff.removed.length === 0) {
    out.push(
      schemaChanged
        ? 'The schema file changed, but no operation was added, removed or altered.'
        : 'No endpoint in the API contract changed.',
      '',
    );
  } else {
    out.push(
      `${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed.`,
      '',
    );
    if (changed.length > 0) {
      out.push(
        table(changed, analysis, (op) => kind.get(op.key) ?? ''),
        '',
      );
      if (gaps.length > 0) {
        out.push(
          `**${gaps.length} changed endpoint(s) are not reached by any test**: ${listOf(gaps)}.`,
          '',
        );
      }
      if (setupOnly.length > 0) {
        out.push(
          `${setupOnly.length} are reached by real tests only to set data up, never driven by a ` +
            `test of their own: ${listOf(setupOnly)}.`,
          '',
        );
      }
      if (stubbedOnly.length > 0) {
        out.push(
          `${stubbedOnly.length} are reached only by stubbed tests, which say nothing about the ` +
            `backend: ${listOf(stubbedOnly)}.`,
          '',
        );
      }
      if (gaps.length + setupOnly.length + stubbedOnly.length === 0) {
        out.push(
          'Every added or changed endpoint is driven by at least one real-backend test.',
          '',
        );
      }
    }
    if (diff.removed.length > 0) {
      out.push(
        `Removed: ${listOf(diff.removed)}. Tests that still call these will fail on their own.`,
        '',
      );
    }
  }
  out.push(footnote(analysis));
  return { markdown: out.join('\n'), gaps, setupOnly, stubbedOnly, warnings };
}

/**
 * The whole contract, changed or not.
 * @param {Map<string, Operation>} operations
 * @param {Analysis} analysis
 */
export function renderFullReport(operations, analysis) {
  const all = [...operations.values()].sort(byKey);
  const driven = all.filter((op) => statusOf(coverageOf(analysis, op)) === 'covered').length;
  return [
    '## API coverage, whole suite',
    '',
    `${driven} of ${all.length} endpoints are driven by a real-backend test.`,
    '',
    table(all, analysis),
    '',
    footnote(analysis),
  ].join('\n');
}

/** @param {Analysis} analysis */
function footnote(analysis) {
  const lines = [
    `Read from ${analysis.passedTests} passing test attempts (${analysis.passedRealTests} against ` +
      'the real backend). "Driven" means a test itself sent a request to the endpoint; "set-up ' +
      'only" means fixtures did, to prepare a test. Neither means the test asserted on the ' +
      'answer: a test can drive an endpoint and check nothing about it.',
  ];
  if (analysis.unmatched.length > 0) {
    lines.push(
      '',
      `Requests that matched no declared endpoint (the schema may be stale): ` +
        analysis.unmatched.map(code).join(', ') +
        '.',
    );
  }
  return lines.join('\n');
}
