// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyse } from './analysis.mjs';
import { diffManifests } from './diff.mjs';
import { parseSchema } from './manifest.mjs';
import { renderChangeReport, renderFullReport } from './render.mjs';
import { baseSpec, sampleSchema } from './sample-schema.mjs';

const base = parseSchema(sampleSchema(baseSpec));
const headSpec = {
  ...baseSpec,
  paths: {
    ...baseSpec.paths,
    '/api/things/{id}': { get: 'Thing' },
    '/api/things/{id}/tags': { get: 'ThingList' },
  },
  schemas: { ...baseSpec.schemas, Owner: 'login: string; email: string' },
};
const head = parseSchema(sampleSchema(headSpec));
const diff = diffManifests(base, head);

const hit = (/** @type {string} */ method, /** @type {string} */ pathname, project = 'ui') => ({
  project,
  testId: `${project}-${method}-${pathname}`,
  title: `${method} ${pathname}`,
  status: 'passed',
  retry: 0,
  hits: [{ method, pathname, via: 'browser' }],
});
/** A UI test whose fixture, not the test, sent the request. */
const setupHit = (/** @type {string} */ method, /** @type {string} */ pathname) => ({
  project: 'ui',
  testId: `setup-${method}-${pathname}`,
  title: `set up ${method} ${pathname}`,
  status: 'passed',
  retry: 0,
  hits: [{ method, pathname, via: 'apiClient' }],
});
const analysisOf = (/** @type {ReturnType<typeof hit>[]} */ records) =>
  analyse({ operations: head, records, realProjects: ['ui'] });

const render = (records, over = {}) =>
  renderChangeReport({
    diff,
    analysis: analysisOf(records),
    pinChange: undefined,
    schemaChanged: true,
    base: 'origin/main',
    ...over,
  });

describe('renderChangeReport', () => {
  it('flags a changed endpoint that no test reaches', () => {
    const report = render([hit('GET', '/api/things')]);
    assert.ok(report.gaps.some((op) => op.key === 'GET /api/owners'));
    assert.ok(report.markdown.includes('not reached by any test'));
    assert.ok(report.markdown.includes('`GET /api/things/{id}/tags`'));
  });

  it('says so plainly when every changed endpoint is reached', () => {
    const records = [...diff.added, ...diff.changed].map((op) =>
      hit(op.method, op.path.replace('{id}', '1').replace('{slug}', 's')),
    );
    const report = render(records);
    assert.deepEqual(report.gaps, []);
    assert.ok(report.markdown.includes('Every added or changed endpoint is driven'));
  });

  it('separates an endpoint only stubs reach from one nothing reaches', () => {
    const report = render([hit('GET', '/api/owners', 'ui-mocked'), hit('GET', '/api/things')]);
    assert.ok(report.stubbedOnly.some((op) => op.key === 'GET /api/owners'));
    assert.ok(!report.gaps.some((op) => op.key === 'GET /api/owners'));
    assert.ok(report.markdown.includes('only by stubbed tests'));
  });

  it('separates an endpoint only used to set up from one a test drives, and from a gap', () => {
    const report = render([hit('GET', '/api/things'), setupHit('GET', '/api/owners')]);
    assert.ok(report.setupOnly.some((op) => op.key === 'GET /api/owners'));
    assert.ok(!report.gaps.some((op) => op.key === 'GET /api/owners'));
    assert.ok(report.markdown.includes('only to set data up'));
    assert.ok(report.markdown.includes('only used to set up'));
  });

  it('does not say every endpoint is driven while one is only set up', () => {
    const records = [...diff.added, ...diff.changed].map((op) =>
      setupHit(op.method, op.path.replace('{id}', '1').replace('{slug}', 's')),
    );
    const report = render(records);
    assert.deepEqual(report.gaps, []);
    assert.ok(!report.markdown.includes('Every added or changed endpoint is driven'));
  });

  it('shows how many tests drive an endpoint and how many only set it up', () => {
    const report = render([hit('GET', '/api/things'), setupHit('GET', '/api/things')]);
    assert.ok(report.markdown.includes('Driven by tests'));
    assert.ok(report.markdown.includes('Set-up only'));
  });

  it('lists removed endpoints without calling them gaps', () => {
    const report = render([hit('GET', '/api/things')]);
    assert.ok(report.markdown.includes('Removed:'));
    assert.ok(report.markdown.includes('`DELETE /api/things/{id}`'));
    assert.ok(!report.gaps.some((op) => op.key === 'DELETE /api/things/{id}'));
  });

  it('warns loudly when the backend pin moved but the schema did not', () => {
    const none = diffManifests(base, base);
    const report = renderChangeReport({
      diff: none,
      analysis: analysisOf([hit('GET', '/api/things')]),
      pinChange: { from: 'a'.repeat(40), to: 'b'.repeat(40) },
      schemaChanged: false,
      base: 'origin/main',
    });
    assert.equal(report.warnings.length, 1);
    assert.ok(report.warnings[0]?.includes('npm run generate:api-types'));
    assert.ok(report.markdown.includes('No endpoint in the API contract changed'));
  });

  it('does not warn about the pin when the schema was regenerated', () => {
    assert.deepEqual(
      render([hit('GET', '/api/things')], { pinChange: { from: 'a', to: 'b' } }).warnings,
      [],
    );
  });

  it('always says what "reached" means', () => {
    assert.ok(render([hit('GET', '/api/things')]).markdown.includes('asserted on the answer'));
  });

  it('escapes table separators in endpoint names', () => {
    assert.ok(!render([hit('GET', '/api/things')]).markdown.includes('||'));
  });
});

describe('renderFullReport', () => {
  it('does not count an endpoint that is only set up as driven', () => {
    const markdown = renderFullReport(head, analysisOf([setupHit('GET', '/api/things')]));
    assert.ok(markdown.includes(`0 of ${head.size} endpoints are driven`));
  });

  it('summarises how many endpoints a test drives', () => {
    const markdown = renderFullReport(head, analysisOf([hit('GET', '/api/things')]));
    assert.ok(markdown.includes(`1 of ${head.size} endpoints are driven`));
  });
});
