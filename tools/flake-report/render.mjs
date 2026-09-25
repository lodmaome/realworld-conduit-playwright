// @ts-check
// Renders the flake dashboard: one self-contained HTML page (inline CSS, inline SVG, no
// scripts, no external resources) from the result of analyse(). Everything that comes from
// test data — ids, error messages, reasons — is escaped: it is text from a test run, and
// this page is published.
import { FLAKE_LIMIT, RELEASE_STREAK, WATCH_LIMIT, WINDOW } from './analysis.mjs';

/** @param {unknown} value */
export const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const percent = (rate) => `${(rate * 100).toFixed(1)}%`;
const CHART_RUNS = 60;

/** @param {ReturnType<typeof import('./analysis.mjs').analyse>['series']} series */
function chart(series) {
  const runs = series.slice(-CHART_RUNS);
  if (runs.length === 0) return '<p class="empty">No runs recorded yet.</p>';

  const width = 720;
  const height = 220;
  const left = 44;
  const top = 12;
  const bottom = 28;
  const plotWidth = width - left - 8;
  const plotHeight = height - top - bottom;
  const max = Math.max(0.05, ...runs.map((r) => r.rate));
  const step = plotWidth / runs.length;
  const barWidth = Math.max(2, Math.min(18, step - 2));
  const y = (rate) => top + plotHeight - (rate / max) * plotHeight;

  const grid = [0, max / 2, max]
    .map(
      (v) =>
        `<line class="grid" x1="${left}" x2="${width - 8}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
        `<text class="axis" x="${left - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${percent(v)}</text>`,
    )
    .join('');

  const bars = runs
    .map((r, i) => {
      const x = left + i * step + (step - barWidth) / 2;
      // A clean run still gets a thin bar, so "ran, no flakes" is visible and distinct from
      // "no data".
      const h = r.flaky === 0 ? 2 : Math.max(2, plotHeight - (y(r.rate) - top));
      const label = `Run #${r.number} (${r.tier}): ${r.flaky} flaky of ${r.executed} executed, ${percent(r.rate)}`;
      return (
        `<rect class="${r.flaky === 0 ? 'bar clean' : 'bar flaky'}" x="${x.toFixed(1)}" ` +
        `y="${(top + plotHeight - h).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}">` +
        `<title>${escapeHtml(label)}</title></rect>`
      );
    })
    .join('');

  const first = runs[0];
  const last = runs.at(-1);
  const ends =
    `<text class="axis" x="${left}" y="${height - 8}">run #${first?.number}</text>` +
    `<text class="axis" x="${width - 8}" y="${height - 8}" text-anchor="end">run #${last?.number}</text>`;

  return (
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc">` +
    `<title id="chart-title">Flake rate per run</title>` +
    `<desc id="chart-desc">Share of executed tests that failed and then passed on retry, for the last ${runs.length} runs. Thin green bars are clean runs.</desc>` +
    grid +
    bars +
    ends +
    `</svg>`
  );
}

const STATUS_LABEL = {
  over: 'over budget',
  watch: 'watch',
  seen: 'seen',
  quarantined: 'quarantined',
};

/**
 * @param {ReturnType<typeof import('./analysis.mjs').analyse>} analysis
 * @param {{ generatedAt?: Date, adrUrl?: string }} [options]
 */
export function renderDashboard(analysis, { generatedAt = new Date(), adrUrl } = {}) {
  const { offenders, quarantined, violations, latest, series } = analysis;

  const banner =
    violations.length > 0
      ? `<p class="banner bad" role="status"><strong>${violations.length} test${violations.length === 1 ? '' : 's'} over the flake budget:</strong> ${escapeHtml(violations.map((v) => v.id).join('; '))}. Fix the test or quarantine it.</p>`
      : `<p class="banner ok" role="status"><strong>No tests over the flake budget</strong> (checked over each test's last ${WINDOW} runs).</p>`;

  const flakyRuns = series.slice(-WINDOW).filter((r) => r.flaky > 0).length;
  const cards = [
    [
      'Latest run',
      latest ? percent(series.at(-1)?.rate ?? 0) : '—',
      latest ? `run #${latest.run.number}, ${latest.run.tier} tier` : 'no data',
    ],
    [
      'Runs with a flake',
      `${flakyRuns} of ${Math.min(series.length, WINDOW)}`,
      `last ${WINDOW} runs`,
    ],
    ['Tests that flaked', String(offenders.length), `in their last ${WINDOW} runs`],
    ['Quarantined', String(quarantined.length), 'run nightly, never blocking'],
  ]
    .map(
      ([label, value, note]) =>
        `<div class="card"><p class="label">${escapeHtml(label)}</p><p class="value">${escapeHtml(value)}</p><p class="note">${escapeHtml(note)}</p></div>`,
    )
    .join('');

  const offenderRows = offenders
    .map(
      (o) =>
        `<tr><td class="id">${escapeHtml(o.id)}</td><td>${o.flaky} of ${o.ran}</td>` +
        `<td><span class="pill ${o.level}">${STATUS_LABEL[o.level]}</span></td>` +
        `<td class="err">${escapeHtml(o.lastErrors[0] ?? '')}</td></tr>`,
    )
    .join('');
  const offenderTable = offenders.length
    ? `<table><caption>Tests that failed then passed on retry, in each test's last ${WINDOW} runs</caption><thead><tr><th scope="col">Test</th><th scope="col">Flaked / ran</th><th scope="col">Status</th><th scope="col">Last error</th></tr></thead><tbody>${offenderRows}</tbody></table>`
    : `<p class="empty">No test has flaked in its last ${WINDOW} runs.</p>`;

  const quarantineRows = quarantined
    .map((q) => {
      const status = q.expired
        ? '<span class="pill over">expired</span>'
        : q.releaseCandidate
          ? '<span class="pill ok">release candidate</span>'
          : '<span class="pill seen">in force</span>';
      return (
        `<tr><td class="id">${escapeHtml(q.id)}</td><td>${escapeHtml(q.until)}</td><td>${escapeHtml(q.reason)}</td>` +
        `<td>${q.passStreak} of ${q.observations}</td><td>${status}</td></tr>`
      );
    })
    .join('');
  const quarantineTable = quarantined.length
    ? `<table><caption>Quarantined tests</caption><thead><tr><th scope="col">Test</th><th scope="col">Until</th><th scope="col">Reason</th><th scope="col">Passing streak</th><th scope="col">Status</th></tr></thead><tbody>${quarantineRows}</tbody></table>`
    : '<p class="empty">Nothing is quarantined.</p>';

  const policy =
    `A test is <strong>over budget</strong> at ${FLAKE_LIMIT} flakes in its last ${WINDOW} runs (a single flake is noise; ${WATCH_LIMIT} is worth watching). ` +
    `A quarantined test is a <strong>release candidate</strong> after ${RELEASE_STREAK} passing nightly runs in a row.` +
    (adrUrl ? ` <a href="${escapeHtml(adrUrl)}">Why these numbers</a>.` : '');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flake report</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--muted:#595959;--line:#d9d9d9;--card:#f6f6f6;--ok:#116329;--bad:#b42318;--warn:#7a4b00;--warn-bg:#fff4d6;--ok-bg:#e6f4ea;--bad-bg:#fdecea}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#a0abb8;--line:#30363d;--card:#161b22;--ok:#3fb950;--bad:#ff7b72;--warn:#e3b341;--warn-bg:#2d2200;--ok-bg:#0f2a17;--bad-bg:#3a1512}}
*{box-sizing:border-box}
body{margin:0 auto;max-width:960px;padding:24px 16px 48px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
h1{margin:0 0 4px}h2{margin:32px 0 8px;font-size:1.15rem}
.meta,.note,.label,.empty,.policy{color:var(--muted)}.meta{margin:0 0 16px}
.banner{padding:10px 14px;border-radius:6px;margin:0 0 20px}.banner.ok{background:var(--ok-bg);color:var(--ok)}.banner.bad{background:var(--bad-bg);color:var(--bad)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px}.card p{margin:0}.label{font-size:.85rem}.value{font-size:1.7rem;font-weight:650}.note{font-size:.85rem}
svg{width:100%;height:auto;display:block}.grid{stroke:var(--line);stroke-width:1}.axis{fill:var(--muted);font-size:11px}.bar.flaky{fill:var(--bad)}.bar.clean{fill:var(--ok)}
table{width:100%;border-collapse:collapse;font-size:.92rem}caption{text-align:left;font-weight:600;padding:0 0 6px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.id{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem;word-break:break-word}.err{color:var(--muted);word-break:break-word}
.pill{display:inline-block;padding:1px 9px;border-radius:99px;font-size:.8rem;font-weight:600;white-space:nowrap;border:1px solid currentColor}
.pill.over{color:var(--bad)}.pill.watch{color:var(--warn)}.pill.ok{color:var(--ok)}.pill.seen,.pill.quarantined{color:var(--muted)}
a{color:var(--ok)}.policy{margin-top:32px;font-size:.9rem}
@media (max-width:640px){th:nth-child(4),td:nth-child(4){display:none}}
</style>
</head>
<body>
<main>
<h1>Flake report</h1>
<p class="meta">Generated ${escapeHtml(generatedAt.toISOString().slice(0, 16).replace('T', ' '))} UTC · ${series.length} run${series.length === 1 ? '' : 's'} of history</p>
${banner}
<div class="cards">${cards}</div>
<h2>Flake rate per run</h2>
${chart(series)}
<h2>Tests that flaked</h2>
${offenderTable}
<h2>Quarantine</h2>
${quarantineTable}
<p class="policy">${policy}</p>
</main>
</body>
</html>
`;
}
