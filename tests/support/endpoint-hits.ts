import { AsyncLocalStorage } from 'node:async_hooks';
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
  /**
   * Set when a fixture sent it to prepare the test (a factory, the auth bootstrap) instead of the
   * test driving it. tools/coverage-gap counts these as "reached", never as "driven".
   */
  setup?: true;
};

const apiSetup = new AsyncLocalStorage<true>();
const browserSetupDepth = new WeakMap<EndpointHit[], number>();

/**
 * Runs `work`, marking every API-client request made inside it (however deep, across awaits) as
 * set-up. Wrap the factories in this. AsyncLocalStorage keeps it exact when calls interleave.
 */
export const asSetup = <T>(work: () => Promise<T>): Promise<T> => apiSetup.run(true, work);

/**
 * Runs `work`, marking the browser requests that happen while it runs as set-up. For a fixture
 * that drives the page to prepare a test (the auth bootstrap). It is a window, not a scope, so it
 * is only right for work that finishes before the test body starts.
 */
export async function asBrowserSetup<T>(hits: EndpointHit[], work: () => Promise<T>): Promise<T> {
  browserSetupDepth.set(hits, (browserSetupDepth.get(hits) ?? 0) + 1);
  try {
    return await work();
  } finally {
    browserSetupDepth.set(hits, (browserSetupDepth.get(hits) ?? 1) - 1);
  }
}

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
    if (!pathname) return;
    const setup = (browserSetupDepth.get(hits) ?? 0) > 0;
    hits.push({
      method: request.method(),
      pathname,
      via: 'browser',
      ...(setup ? { setup: true } : {}),
    });
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
    if (!pathname) return;
    const setup = apiSetup.getStore() === true;
    hits.push({
      method: method.toUpperCase(),
      pathname,
      via: 'apiClient',
      ...(setup ? { setup: true } : {}),
    });
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
