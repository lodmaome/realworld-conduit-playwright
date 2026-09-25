// @ts-check
// The report: Markdown for the job summary, plus one annotation per endpoint that needs attention.
import { statusOf } from './analysis.mjs';
import { byKey } from './diff.mjs';

/** @typedef {import('./manifest.mjs').Operation} Operation */
/** @typedef {import('./diff.mjs').ContractDiff} ContractDiff */
/** @typedef {import('./analysis.mjs').Analysis} Analysis */

const LABEL = {
  covered: 'covered',
  'only-stubbed': 'only stubbed',
  gap: 'no test reaches it',
};

const cell = (/** @type {string} */ text) => text.replace(/\|/g, '\\|');
const code = (/** @type {string} */ text) => `\`${cell(text)}\``;

/**
 * @param {Operation[]} operations
 * @param {Analysis} analysis
 * @param {(operation: Operation) => string} [note]
 */
function table(operations, analysis, note) {
  const rows = operations.map((operation) => {
    const entry = /** @type {NonNullable<ReturnType<typeof analysis.coverage.get>>} */ (
      analysis.coverage.get(operation.key)
    );
    const status = LABEL[statusOf(entry)];
    const reached = entry.real > 0 ? `${entry.real} (${entry.via.join(', ')})` : '0';
    return [
      code(operation.key),
      note ? note(operation) : '',
      reached,
      String(entry.stubbed),
      status,
    ];
  });
  const header = note
    ? ['Endpoint', 'Change', 'Real tests', 'Stubbed tests', 'Status']
    : ['Endpoint', '', 'Real tests', 'Stubbed tests', 'Status'];
  const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  return lines.join('\n');
}

/**
 * @param {object} input
 * @param {ContractDiff} input.diff
 * @param {Analysis} input.analysis
 * @param {{ from: string, to: string } | undefined} input.pinChange  The backend pin, if it moved.
 * @param {boolean} input.schemaChanged  Whether `schema.d.ts` differs at all.
 * @param {string} input.base
 * @returns {{ markdown: string, gaps: Operation[], weak: Operation[], warnings: string[] }}
 */
export function renderChangeReport({ diff, analysis, pinChange, schemaChanged, base }) {
  const changed = [...diff.added, ...diff.changed].sort(byKey);
  const kind = new Map([
    ...diff.added.map((op) => /** @type {const} */ ([op.key, 'added'])),
    ...diff.changed.map((op) => /** @type {const} */ ([op.key, 'changed'])),
  ]);
  const statusFor = (/** @type {Operation} */ op) =>
    statusOf(
      /** @type {NonNullable<ReturnType<typeof analysis.coverage.get>>} */ (
        analysis.coverage.get(op.key)
      ),
    );
  const gaps = changed.filter((op) => statusFor(op) === 'gap');
  const weak = changed.filter((op) => statusFor(op) === 'only-stubbed');

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
          `**${gaps.length} changed endpoint(s) are not reached by any test**: ` +
            `${gaps.map((op) => code(op.key)).join(', ')}.`,
          '',
        );
      }
      if (weak.length > 0) {
        out.push(
          `${weak.length} are reached only by stubbed tests, which say nothing about the backend: ` +
            `${weak.map((op) => code(op.key)).join(', ')}.`,
          '',
        );
      }
      if (gaps.length === 0 && weak.length === 0) {
        out.push(
          'Every added or changed endpoint is reached by at least one real-backend test.',
          '',
        );
      }
    }
    if (diff.removed.length > 0) {
      out.push(
        `Removed: ${diff.removed.map((op) => code(op.key)).join(', ')}. Tests that still call ` +
          'these will fail on their own.',
        '',
      );
    }
  }
  out.push(footnote(analysis));
  return { markdown: out.join('\n'), gaps, weak, warnings };
}

/**
 * The whole contract, changed or not.
 * @param {Map<string, Operation>} operations
 * @param {Analysis} analysis
 */
export function renderFullReport(operations, analysis) {
  const all = [...operations.values()].sort(byKey);
  const unreached = all.filter(
    (op) =>
      statusOf(
        /** @type {NonNullable<ReturnType<typeof analysis.coverage.get>>} */ (
          analysis.coverage.get(op.key)
        ),
      ) !== 'covered',
  );
  return [
    '## API coverage, whole suite',
    '',
    `${all.length - unreached.length} of ${all.length} endpoints are reached by a real-backend test.`,
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
      'the real backend). "Reached" means a test sent a request to the endpoint, not that it ' +
      'asserted on the answer: an endpoint used only to set data up is reached too.',
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
