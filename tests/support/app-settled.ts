import type { Page, Request } from '@playwright/test';

/**
 * Resolves when the request to `pathname` has ended, whether it was answered or dropped.
 * Start it BEFORE the navigation that makes the request, then `await` it afterwards.
 */
export function requestEnded(page: Page, pathname: string): Promise<void> {
  return new Promise((resolve) => {
    const done = (request: Request) => {
      if (new URL(request.url()).pathname !== pathname) return;
      page.off('requestfinished', done);
      page.off('requestfailed', done);
      resolve();
    };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
  });
}

/**
 * Lets the app process a response it has just received: two animation frames, by which
 * point Angular has run change detection for it.
 *
 * Only for asserting that something did NOT happen (no error shown, nothing rendered). A
 * positive assertion should use a web-first `expect` that retries. The frontend exposes no
 * hook for feed or article state (only auth, see conduit-debug.d.ts), so a negative can't
 * wait on a signal from the app; this narrows the window in which it could pass too early
 * without pretending to close it.
 */
export async function afterAppHandled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
