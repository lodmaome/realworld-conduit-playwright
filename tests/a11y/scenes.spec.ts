import AxeBuilder from '@axe-core/playwright';
import { scenes } from '../support/scenes';
import { expect, test } from '../fixtures/base';

const WCAG_A_AND_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// The app has known accessibility defects we can't fix (we don't own its markup), so the
// suite is a ratchet rather than a "zero violations" gate: each scene's violations are
// recorded in tests/a11y/known-violations/<scene>.txt, and any difference fails — a new
// violation is a regression, and a violation that disappeared means the record is stale.
// Update the records with `npm run test:a11y:update`, and explain each in the README.
for (const scene of scenes) {
  test(`${scene.name} has no new accessibility violations`, async ({ page, mockApi, pages }) => {
    await mockApi(scene.api);
    await scene.open(pages);
    await scene.ready(pages);

    // Colour contrast is judged on computed colours, and the theme fades link colours with CSS
    // transitions. Scanned mid-fade, the same page reported a different number of
    // contrast failures on every run — so freeze them before measuring.
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AND_AA).analyze();

    // Full detail (selectors, help links) for whoever has to fix or triage a failure.
    await test.info().attach('axe-violations.json', {
      body: JSON.stringify(violations, null, 2),
      contentType: 'application/json',
    });

    const summary = violations
      .map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`)
      .sort()
      .join('\n');
    expect(`${summary || '(none)'}\n`).toMatchSnapshot(`${scene.name}.txt`);
  });
}
