import { test as base, expect } from '../fixtures/base';

/**
 * Every visual spec imports `test` from here, not from fixtures/base. Baselines are only
 * comparable when the browser, fonts and OS libraries are identical, so the suite refuses
 * to run anywhere but the pinned Playwright image — a screenshot taken on a developer's
 * machine would fail against CI's baselines (or worse, silently replace them).
 */
export const test = base.extend<{ pinnedImageOnly: void }>({
  pinnedImageOnly: [
    async ({}, use) => {
      if (!process.env.PW_PINNED_IMAGE) {
        throw new Error(
          'Visual tests must run in the pinned Playwright image so baselines match CI.\n' +
            '  Run them:                 npm run test:visual\n' +
            '  Regenerate baselines:     npm run test:visual:update',
        );
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
