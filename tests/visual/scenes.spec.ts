import { scenes } from '../support/scenes';
import { expect, test } from './visual-test';

// One baseline per scene, rendered from fixed stub data (see support/sample-data.ts) with
// external fonts blocked, so a diff means the app's markup or styling changed — never the
// data, the clock, or the internet.
for (const scene of scenes) {
  test(`${scene.name} looks as expected`, async ({ page, mockApi, pages }) => {
    await mockApi(scene.api);
    await scene.open(pages);
    await scene.ready(pages);
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot(`${scene.name}.png`, { fullPage: true });
  });
}
