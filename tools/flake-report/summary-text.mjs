// @ts-check
// The text a CI run shows about its own flakes: a Markdown block for the job summary and
// GitHub "workflow command" annotations. Pure, so both can be tested.
import { flakeRate } from './analysis.mjs';

/** Workflow commands are line-based and use % , : as syntax, so data must be escaped. */
const escapeData = (text) =>
  text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = (text) => escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C');
const cell = (text) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');

/** @param {import('./analysis.mjs').HistoryEntry} entry */
export function summaryMarkdown(entry) {
  const { totals, flaky, quarantined } = entry;
  const executed = totals.passed + totals.failed + totals.flaky;
  const rate = `${(flakeRate(totals) * 100).toFixed(1)}%`;
  const lines = [
    '### Flaky tests',
    '',
    flaky.length === 0
      ? `None: all ${executed} executed tests passed first time or failed outright.`
      : `**${flaky.length} of ${executed}** executed tests failed and then passed on retry (${rate}). The run is green because of the retry — these are the tests it papered over.`,
  ];

  if (flaky.length > 0) {
    lines.push('', '| Test | Attempts | First failure |', '| --- | --- | --- |');
    for (const f of flaky) {
      lines.push(`| ${cell(f.id)} | ${f.attempts} | ${cell(f.errors[0] ?? '')} |`);
    }
  }

  if (quarantined.length > 0) {
    lines.push(
      '',
      `Quarantined tests run in this job: ${quarantined.map((q) => `${q.id} (${q.outcome})`).join('; ')}`,
    );
  }
  return lines.join('\n') + '\n';
}

/** @param {import('./analysis.mjs').HistoryEntry} entry @returns {string[]} */
export function annotations(entry) {
  return entry.flaky.map(
    (f) =>
      `::warning title=${escapeProperty('Flaky test (passed on retry)')}::${escapeData(`${f.id} — ${f.errors[0] ?? 'failed once'}`)}`,
  );
}
