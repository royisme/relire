/**
 * A failed Listen shows its real reason where it happened, visibly on touch too (a phone has no
 * tooltips): a small overlay at the control that never adds a page row, the practice card's bounded
 * status line, and the article player's line with the failing sentence's reason. The page and its
 * controls stay where they were, and nothing sticks out of the viewport sideways. Every provider
 * request is answered by fixtures with a failing body; no key is real.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, layout, openArticle, overflowing, settled, test } from './fixtures';
import { openUnit, row, seedUnits } from './practice.helpers';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';

// The practice card records, so it needs the fake microphone like the shadowing specs.
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  },
});

/** The app must not grow a horizontal scrollbar, however long the provider's reason is. */
async function fitsViewport(page: Page) {
  const { scroll, view } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    view: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(view);
}

/** Fails every speech request with `message`, instead of the fixtures' short "tts failed". */
async function failTtsWith(page: Page, message: string) {
  await page.route(/-tts:/, (route) => route.fulfill({ status: 500, body: JSON.stringify({ error: { message } }) }));
}

/** Readable by a sighted user: a real box, not a screen-reader-only one-pixel sliver. */
async function expectReadable(reason: Locator) {
  await expect(reason).toBeVisible();
  const box = await reason.boundingBox();
  expect(box, 'the reason has a real box').not.toBeNull();
  expect(box!.width).toBeGreaterThan(24);
  expect(box!.height).toBeGreaterThan(10);
}

const units = CATALOG_EXERCISES.units.filter((unit) => unit.id === 'unit-word-transform');
const card = (page: Page) => page.locator('[data-practice-card]');

test.beforeEach(async ({ page, ai }) => {
  void ai; // onboards the app with a test key, so the first-run guide stays closed
  await seedUnits(page, units);
});

test('a failed sheet Listen shows its real reason visibly, without moving the page', async ({ page, ai }) => {
  ai.fail(['tts']);
  await openUnit(page, 'unit-word-transform', 'Le féminin des adjectifs');
  const one = row(page, 'intrigué');
  const before = await layout(page, 'main');
  await one.getByRole('button', { name: 'Listen' }).click();
  // The control itself carries the provider's reason as visible text, not only a tooltip or SR text.
  const reason = one.getByRole('alert');
  await expectReadable(reason);
  await expect(reason).toContainText('Listen failed');
  await expect(reason).toContainText('tts failed');
  // A fixed-size icon and an overlay: the sheet and its controls stay exactly where they were.
  const after = await layout(page, 'main');
  expect({ top: after.top, height: after.height, width: after.width }).toEqual(before);
  await fitsViewport(page);
});

test('a failed reference shows its real reason in the practice card status line', async ({ page, ai }) => {
  ai.fail(['tts']);
  await openArticle(page);
  const sentence = page.locator('article [data-sentence]').nth(1);
  await sentence.hover();
  await page.locator('[data-practice-entry]').click();
  await expect(card(page).getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.waitForTimeout(900);
  await card(page).getByRole('button', { name: 'Stop' }).click();
  await expect(card(page).getByText('Saved.')).toBeVisible();
  const before = await layout(page, 'article');
  await card(page).getByRole('button', { name: 'Reference' }).click();
  const reason = card(page).getByRole('alert');
  await expectReadable(reason);
  await expect(reason).toContainText('Listen failed');
  await expect(reason).toContainText('tts failed');
  // The card is an overlay in the dock; the article does not move.
  const after = await layout(page, 'article');
  expect({ top: after.top, width: after.width }).toEqual({ top: before.top, width: before.width });
});

test('a failed sentence in the article player shows the real reason, not a generic one', async ({ page, ai }) => {
  ai.fail(['tts']);
  await openArticle(page);
  const before = await layout(page, 'article');
  await page.getByRole('button', { name: 'Listen' }).click();
  const player = page.getByRole('region', { name: 'Article player' });
  await expect(player.getByText(/could not be played/)).toBeVisible();
  await expect(player).toContainText('tts failed');
  const after = await layout(page, 'article');
  expect({ top: after.top, width: after.width }).toEqual({ top: before.top, width: before.width });
});

test('a long reason wraps inside the viewport on a 360 px phone @phone', async ({ page }) => {
  await failTtsWith(page, `un mot très long `.repeat(30).trim());
  await openUnit(page, 'unit-word-transform', 'Le féminin des adjectifs');
  const one = row(page, 'intrigué');
  const before = await layout(page, 'main');
  await one.getByRole('button', { name: 'Listen' }).click();
  const reason = one.getByRole('alert');
  await expectReadable(reason);
  await expect(reason).toContainText('Listen failed');
  await expect(reason).toContainText('très long');
  const after = await layout(page, 'main');
  expect({ top: after.top, height: after.height, width: after.width }).toEqual(before);
  await fitsViewport(page);
});

test('a failed reference is visible on a phone, where the control has no text @phone', async ({ page, ai }) => {
  ai.fail(['tts']);
  await openArticle(page);
  await page.locator('article [data-sentence]').nth(1).tap();
  await page.locator('[data-sentence-actions] [data-practice-entry]').tap();
  await expect(card(page).getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.waitForTimeout(900);
  await card(page).getByRole('button', { name: 'Stop' }).tap();
  await expect(card(page).getByText('Saved.')).toBeVisible();
  await card(page).getByRole('button', { name: 'Reference' }).tap();
  const reason = card(page).getByRole('alert');
  await expectReadable(reason);
  await expect(reason).toContainText('tts failed');
  await fitsViewport(page);
});

test('a long failed sentence in the article player stays inside a 360 px phone @phone', async ({ page }) => {
  await failTtsWith(page, `un mot très long `.repeat(30).trim());
  await openArticle(page);
  await settled(page);
  await page.getByRole('button', { name: 'Listen' }).click();
  const player = page.getByRole('region', { name: 'Article player' });
  await expect(player.getByText(/could not be played/)).toBeVisible();
  await expect(player).toContainText('très long');
  await fitsViewport(page);
  expect(await overflowing(page.locator('body'))).toEqual([]);
});
