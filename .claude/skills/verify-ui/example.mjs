// Example: open the first article, play a sentence, assert the page did not move, check 360 px overflow.
import { openApp, layout, overflowing, checks } from './harness.mjs';

const url = process.argv[2] || 'http://localhost:5173';
const { check, report } = checks();

{
  const { browser, page, calls } = await openApp({ url });
  await page.getByText('Le Petit Prince').first().click();
  await page.waitForTimeout(500);
  const before = await layout(page, 'article');
  await page.locator('article [data-sentence]').nth(1).hover();
  await page.locator('[data-sentence-actions] button').first().click();
  await page.waitForTimeout(150);
  const during = await layout(page, 'article');
  check('playing does not move the article', before.top === during.top && before.height === during.height, JSON.stringify({ before, during }));
  check('speech was synthesized once', calls.tts === 1, `tts=${calls.tts}`);
  await browser.close();
}

{
  const { browser, page } = await openApp({ url, viewport: { width: 360, height: 740 }, touch: true });
  const bad = await overflowing(page.locator('body'));
  check('360 px library has no horizontal overflow', bad.length === 0, bad.join(', '));
  await browser.close();
}

report();
