// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyse, statusOf } from './analysis.mjs';
import { parseSchema } from './manifest.mjs';
import { baseSpec, sampleSchema } from './sample-schema.mjs';

const operations = parseSchema(sampleSchema(baseSpec));

/** @param {Partial<import('./analysis.mjs').HitRecord>} over */
const record = (over = {}) => ({
  project: 'ui',
  testId: 't1',
  title: 'a test',
  status: 'passed',
  retry: 0,
  hits: [{ method: 'GET', pathname: '/api/things', via: 'browser' }],
  ...over,
});
const run = (/** @type {import('./analysis.mjs').HitRecord[]} */ records) =>
  analyse({ operations, records, realProjects: ['api', 'ui'] });

describe('analyse', () => {
  it('counts a passing real-backend test as covering what it reached', () => {
    const analysis = run([record()]);
    const entry = analysis.coverage.get('GET /api/things');
    assert.equal(entry?.real, 1);
    assert.deepEqual(entry?.via, ['browser']);
    assert.deepEqual(entry?.examples, ['a test']);
    assert.equal(statusOf(/** @type {any} */ (entry)), 'covered');
  });

  it('lists every operation, including ones nothing reached', () => {
    const analysis = run([record()]);
    assert.equal(analysis.coverage.size, operations.size);
    assert.equal(statusOf(/** @type {any} */ (analysis.coverage.get('GET /api/owners'))), 'gap');
  });

  it('does not count a failed test: it may never have reached what it was written for', () => {
    for (const status of ['failed', 'timedOut', 'skipped', 'interrupted']) {
      const analysis = run([record({ status }), record({ testId: 'other' })]);
      assert.equal(analysis.coverage.get('GET /api/things')?.real, 1, status);
    }
  });

  it('counts a test once when a retry passed after a failed attempt', () => {
    const analysis = run([record({ status: 'failed', retry: 0 }), record({ retry: 1 })]);
    assert.equal(analysis.coverage.get('GET /api/things')?.real, 1);
  });

  it('counts a test once however many times it sent the request', () => {
    const hit = { method: 'GET', pathname: '/api/things', via: 'browser' };
    assert.equal(run([record({ hits: [hit, hit, hit] })]).coverage.get('GET /api/things')?.real, 1);
  });

  it('keeps stubbed tests apart: they are not backend coverage', () => {
    const analysis = run([record({ project: 'ui-mocked', testId: 'stub' })]);
    const entry = analysis.coverage.get('GET /api/things');
    assert.equal(entry?.real, 0);
    assert.equal(entry?.stubbed, 1);
    assert.equal(statusOf(/** @type {any} */ (entry)), 'only-stubbed');
    assert.equal(analysis.passedRealTests, 0);
  });

  it('records how a real test reached an endpoint', () => {
    const analysis = run([
      record({ hits: [{ method: 'GET', pathname: '/api/things', via: 'apiClient' }] }),
      record({ testId: 't2' }),
    ]);
    assert.deepEqual(analysis.coverage.get('GET /api/things')?.via, ['apiClient', 'browser']);
  });

  it('matches concrete paths to their templates', () => {
    const analysis = run([
      record({ hits: [{ method: 'DELETE', pathname: '/api/things/99', via: 'browser' }] }),
    ]);
    assert.equal(analysis.coverage.get('DELETE /api/things/{id}')?.real, 1);
  });

  it('reports requests that fit no declared endpoint, so a stale schema is visible', () => {
    const analysis = run([
      record({ hits: [{ method: 'GET', pathname: '/api/brand-new', via: 'browser' }] }),
    ]);
    assert.deepEqual(analysis.unmatched, ['GET /api/brand-new']);
  });

  it('counts the passing attempts it read', () => {
    const analysis = run([
      record(),
      record({ testId: 'b', project: 'ui-mocked' }),
      record({ status: 'failed', testId: 'c' }),
    ]);
    assert.equal(analysis.passedTests, 2);
    assert.equal(analysis.passedRealTests, 1);
  });
});

describe('driven versus set-up', () => {
  const via = (/** @type {'browser' | 'apiClient'} */ channel, extra = {}) => ({
    method: 'GET',
    pathname: '/api/things',
    via: channel,
    ...extra,
  });
  const entryFor = (
    /** @type {import('./analysis.mjs').HitRecord[]} */ records,
    /** @type {string[] | undefined} */ apiProjects = undefined,
  ) =>
    /** @type {import('./analysis.mjs').OperationCoverage} */ (
      analyse({ operations, records, realProjects: ['api', 'ui'], apiProjects }).coverage.get(
        'GET /api/things',
      )
    );

  it('counts a request the browser sent as driven', () => {
    const entry = entryFor([record({ hits: [via('browser')] })]);
    assert.equal(entry.driven, 1);
    assert.equal(statusOf(entry), 'covered');
  });

  it('counts the API client in the api project as driven', () => {
    const entry = entryFor([record({ project: 'api', hits: [via('apiClient')] })]);
    assert.equal(entry.driven, 1);
    assert.equal(statusOf(entry), 'covered');
  });

  it('counts the API client in a UI project as set-up: the UI is what that test drives', () => {
    const entry = entryFor([record({ project: 'ui', hits: [via('apiClient')] })]);
    assert.equal(entry.real, 1);
    assert.equal(entry.driven, 0);
    assert.equal(statusOf(entry), 'only-setup');
  });

  it('counts a request the recorder flagged as set-up as set-up, even in the api project', () => {
    const entry = entryFor([record({ project: 'api', hits: [via('apiClient', { setup: true })] })]);
    assert.equal(entry.driven, 0);
    assert.equal(statusOf(entry), 'only-setup');
  });

  it('counts the browser traffic of an auth bootstrap as set-up', () => {
    const entry = entryFor([record({ hits: [via('browser', { setup: true })] })]);
    assert.equal(statusOf(entry), 'only-setup');
  });

  it('is covered as soon as any one test drives it, however many only set it up', () => {
    const entry = entryFor([
      record({ testId: 'a', project: 'ui', hits: [via('apiClient')] }),
      record({ testId: 'b', project: 'ui', hits: [via('apiClient', { setup: true })] }),
      record({ testId: 'c', project: 'ui', hits: [via('browser')] }),
    ]);
    assert.equal(entry.real, 3);
    assert.equal(entry.driven, 1);
    assert.equal(statusOf(entry), 'covered');
  });

  it('counts a test that both drives and sets up an endpoint as driving it', () => {
    const entry = entryFor([
      record({ project: 'api', hits: [via('apiClient', { setup: true }), via('apiClient')] }),
    ]);
    assert.equal(entry.driven, 1);
  });

  it('takes the projects whose API client is the subject from the caller', () => {
    const records = [record({ project: 'ui', hits: [via('apiClient')] })];
    assert.equal(statusOf(entryFor(records, ['ui'])), 'covered');
    assert.equal(statusOf(entryFor(records, ['api'])), 'only-setup');
  });

  it('shows the tests that drive an endpoint as its examples, not the ones that set it up', () => {
    const entry = entryFor([
      record({ testId: 'a', title: 'drives it', hits: [via('browser')] }),
      record({ testId: 'b', title: 'sets it up', project: 'ui', hits: [via('apiClient')] }),
    ]);
    assert.deepEqual(entry.examples, ['drives it']);
  });

  it('never counts a stubbed test as driving anything', () => {
    const entry = entryFor([record({ project: 'ui-mocked', hits: [via('browser')] })]);
    assert.equal(entry.driven, 0);
    assert.equal(statusOf(entry), 'only-stubbed');
  });
});
