import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext, BrowserContext, TestInfo } from '@playwright/test';

// Records which API endpoints a test actually sent requests to, for tools/coverage-gap. It
// watches the traffic instead of asking each test to declare what it covers, so it can't go
// stale or be forgotten. Off unless RECORD_ENDPOINT_HITS names a directory (see
// tools/coverage-gap/record.mjs), and then it only observes: no request is altered.

export type EndpointHit = {
  method: string;
  pathname: string;
  /** Who sent it: the page under test, or the API client (which sets data up and also is the API suite). */
  via: 'browser' | 'apiClient';
};

export const recordingDir = (): string | undefined => process.env.RECORD_ENDPOINT_HITS || undefined;

/** Only requests to the API count, and only by path: the query string is not part of an endpoint. */
function apiPath(url: string, apiBaseUrl: string): string | undefined {
  const target = new URL(url);
  const api = new URL(apiBaseUrl);
  return target.origin === api.origin &&
    target.pathname.startsWith(api.pathname.replace(/\/?$/, '/'))
    ? target.pathname
    : undefined;
}

/** Everything the pages of this context ask the API for, including requests a route stubs. */
export function trackBrowserHits(
  context: BrowserContext,
  apiBaseUrl: string,
  hits: EndpointHit[],
): void {
  context.on('request', (request) => {
    const pathname = apiPath(request.url(), apiBaseUrl);
    if (pathname) hits.push({ method: request.method(), pathname, via: 'browser' });
  });
}

const VERBS = ['get', 'post', 'put', 'patch', 'delete', 'head'] as const;

/**
 * The same request context, recording each call on the way through. A standalone
 * APIRequestContext emits no events, so wrapping it is the only way to see what it sends.
 */
export function trackApiHits(
  request: APIRequestContext,
  apiBaseUrl: string,
  hits: EndpointHit[],
): APIRequestContext {
  const record = (method: string, url: unknown) => {
    if (typeof url !== 'string') return;
    const pathname = apiPath(new URL(url, apiBaseUrl).href, apiBaseUrl);
    if (pathname) hits.push({ method: method.toUpperCase(), pathname, via: 'apiClient' });
  };

  return new Proxy(request, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof value !== 'function') return value;
      const fn = value as (...args: unknown[]) => unknown;
      if (VERBS.includes(property as (typeof VERBS)[number])) {
        return (url: unknown, options?: unknown) => {
          record(String(property), url);
          return fn.call(target, url, options);
        };
      }
      if (property === 'fetch') {
        return (url: unknown, options?: { method?: string }) => {
          record(options?.method ?? 'GET', url);
          return fn.call(target, url, options);
        };
      }
      return fn.bind(target);
    },
  });
}

/** One file per test attempt, so parallel workers never write the same file. */
export function writeEndpointHits(dir: string, testInfo: TestInfo, hits: EndpointHit[]): void {
  const projectDir = join(dir, testInfo.project.name);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, `${testInfo.testId}-r${testInfo.retry}.json`),
    JSON.stringify({
      version: 1,
      project: testInfo.project.name,
      testId: testInfo.testId,
      title: testInfo.titlePath.slice(1).join(' › '),
      status: testInfo.status ?? 'unknown',
      retry: testInfo.retry,
      hits,
    }),
  );
}
