// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WINDOW, analyse, summariseRun } from './analysis.mjs';
import { escapeHtml, renderDashboard } from './render.mjs';

const run = (n) => ({
  id: String(n),
  number: n,
  attempt: 1,
  sha: 'abc',
  ref: 'main',
  event: 'push',
  tier: 'regression',
  at: '2026-09-25T03:00:00Z',
  url: 'https://example.test',
});
const rec = (id, outcome, extra = {}) => ({ id, outcome, attempts: 1, errors: [], ...extra });
const entry = (n, tests) => summariseRun([{ schema: 1, startedAt: '', tests }], run(n));
const page = (history, options) =>
  renderDashboard(analyse(history, options), { generatedAt: new Date('2026-09-25T10:00:00Z') });

describe('escapeHtml', () => {
  it('escapes the five characters that matter', () => {
    assert.equal(
      escapeHtml(`<a href="x">'&'</a>`),
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('renderDashboard', () => {
  it('renders an empty history without throwing', () => {
    const html = page([]);
    assert.match(html, /No runs recorded yet/);
    assert.match(html, /No tests over the flake budget/);
    assert.match(html, /Nothing is quarantined/);
  });

  it('escapes test names, errors and reasons: they come from a test run', () => {
    const evil = '<script>alert(1)</script>';
    const history = [
      entry(1, [rec(`ui › ${evil}`, 'flaky', { errors: [`boom ${evil}`] })]),
      summariseRun(
        [
          {
            schema: 1,
            startedAt: '',
            tests: [rec('ui › q', 'passed', { quarantine: { until: '2027-01-01', reason: evil } })],
          },
        ],
        run(2),
      ),
    ];
    const html = page(history);
    assert.doesNotMatch(html, /<script/i);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  it('loads nothing external and runs no script', () => {
    const html = page([entry(1, [rec('ui › a', 'flaky')])]);
    assert.doesNotMatch(html, /<script|<link|<img|src=|@import|url\(/i);
  });

  it('announces tests over the flake budget, naming them', () => {
    const history = Array.from({ length: WINDOW }, (_, i) =>
      entry(i + 1, [rec('ui › shaky', 'flaky')]),
    );
    const html = page(history);
    assert.match(html, /1 test over the flake budget/);
    assert.match(html, /over budget/);
    assert.match(html, /ui › shaky/);
  });

  it('draws a bar per run, with clean runs distinct from flaky ones', () => {
    const html = page([entry(1, [rec('a', 'passed')]), entry(2, [rec('a', 'flaky')])]);
    assert.equal((html.match(/<rect /g) ?? []).length, 2);
    assert.match(html, /class="bar clean"/);
    assert.match(html, /class="bar flaky"/);
  });

  it('gives the chart a text alternative', () => {
    const html = page([entry(1, [rec('a', 'passed')])]);
    assert.match(html, /role="img" aria-labelledby="chart-title chart-desc"/);
  });

  it('shows quarantine status: expired, release candidate, in force', () => {
    const q = (until) => rec('ui › q', 'passed', { quarantine: { until, reason: 'why' } });
    const expired = page([entry(1, [q('2020-01-01')])], { now: new Date('2026-09-25T00:00:00Z') });
    assert.match(expired, /pill over">expired/);
    const inForce = page([entry(1, [q('2099-01-01')])]);
    assert.match(inForce, /pill seen">in force/);
    const release = page(Array.from({ length: 7 }, (_, i) => entry(i + 1, [q('2099-01-01')])));
    assert.match(release, /release candidate/);
  });

  it('is a valid standalone document with a language and a title', () => {
    const html = page([]);
    assert.match(html, /^<!doctype html>\n<html lang="en">/);
    assert.match(html, /<title>Flake report<\/title>/);
  });
});
