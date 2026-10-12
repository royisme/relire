/** Reader basics: sentence playback stays in place; the library fits a phone. */
import { expect, layout, openArticle, overflowing, test } from './fixtures';

test('playing a sentence does not move the article', async ({ page, ai }) => {
  await openArticle(page);
  const before = await layout(page, 'article');
  await page.locator('article [data-sentence]').nth(1).hover();
  await page.locator('[data-sentence-actions] button').first().click();
  await expect.poll(() => ai.calls.tts).toBe(1);
  expect(await layout(page, 'article')).toEqual(before);
});

test('library has no horizontal overflow @phone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Le Petit Prince').first()).toBeVisible();
  expect(await overflowing(page.locator('body'))).toEqual([]);
});
