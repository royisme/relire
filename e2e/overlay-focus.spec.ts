/**
 * Dialog, Sheet and Drawer share one contract: focus moves in on open and back to the opener on close, Tab and
 * Shift+Tab stay in the panel, Escape closes only the topmost overlay, the backdrop (not the panel) closes, and the
 * page does not scroll while any overlay is open. No AI answer is needed beyond the fixture's default word.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, openArticle, test } from './fixtures';
import { seed } from './vocabulary.helpers';

type Point = { x: number; y: number };
const dialogs = (page: Page) => page.locator('[role="dialog"]');

/** Two animation frames, so a close that is about to happen has happened; not a sleep. */
const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/** The page is taller than the window for the whole test, so a wheel can tell locked from unlocked. */
async function makePageScrollable(page: Page) {
  await page.evaluate(() => (document.documentElement.style.minHeight = '4000px'));
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
}

/** Wheeling over `at` moves the page. */
async function expectPageScrolls(page: Page, at: Point) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => scrollTo(0, 0));
}

/** Wheeling over `at` leaves the page where it is. */
async function expectPageLocked(page: Page, at: Point) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, 600);
  await frames(page);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  // A wheel may animate, so the lock itself is also read: neither the page nor its body can scroll.
  expect(
    await page.evaluate(() =>
      [document.documentElement, document.body].some((el) => getComputedStyle(el).overflowY === 'hidden'),
    ),
  ).toBe(true);
}

const focusIsIn = (panel: Locator) => panel.evaluate((element) => element.contains(document.activeElement));
const expectFocusIn = (panel: Locator) => expect.poll(() => focusIsIn(panel)).toBe(true);

async function expectKeysStayIn(page: Page, panel: Locator) {
  // More presses than the panel has tab stops, so each direction crosses the last-to-first boundary.
  const stops = await panel.evaluate(
    (element) =>
      element.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ).length,
  );
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let press = 0; press < stops + 2; press++) {
      await page.keyboard.press(key);
      await expectFocusIn(panel);
    }
  }
}

interface Overlay {
  /** Where the overlay opens from, and the control that must get focus back. */
  opener: Locator;
  open: () => Promise<void>;
  panel: Locator;
  /** A spot inside the panel that does nothing when clicked. */
  inside: Locator;
  /** A point on the backdrop, outside the panel. */
  backdrop: Point;
}

/** Opens the overlay twice: once closed with Escape, once with a backdrop click. */
async function checkOverlay(page: Page, { opener, open, panel, inside, backdrop }: Overlay) {
  await makePageScrollable(page);
  await expectPageScrolls(page, backdrop);
  for (const close of ['Escape', 'backdrop']) {
    await open();
    await expect(panel).toBeVisible();
    await expectFocusIn(panel);
    await expectPageLocked(page, backdrop);
    await expectKeysStayIn(page, panel);

    // A click inside the panel keeps it open.
    await inside.click();
    await frames(page);
    await expect(panel).toBeVisible();

    if (close === 'Escape') await page.keyboard.press('Escape');
    else await page.mouse.click(backdrop.x, backdrop.y);
    await expect(panel).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expectPageScrolls(page, backdrop);
  }
}

test('Dialog keeps focus and scroll, closes on Escape and on the backdrop', async ({ page, ai }) => {
  void ai;
  await page.goto('/#/read');
  const opener = page.getByRole('button', { name: 'Add article' }).first();
  const panel = dialogs(page);
  await checkOverlay(page, {
    opener,
    open: () => opener.click(),
    panel,
    inside: panel.getByRole('heading', { name: 'Add an article' }),
    backdrop: { x: 20, y: 450 },
  });
});

test('Sheet keeps focus and scroll, closes on Escape and on the backdrop', async ({ page, ai }) => {
  void ai;
  await openArticle(page);
  const opener = page.locator('article [data-sentence]').first().locator('[data-reader-word="2"]');
  const panel = dialogs(page);
  await checkOverlay(page, {
    opener,
    // The word is a focusable button; Enter on it is the keyboard way to open its sheet. Wait for the answer, which
    // replaces the sheet's loading content, so no focus check runs on a control that is about to go away.
    open: async () => {
      await opener.focus();
      await page.keyboard.press('Enter');
      await expect(panel.getByRole('heading', { name: 'chose' })).toBeVisible();
    },
    panel,
    inside: panel.getByRole('heading').first(),
    backdrop: { x: 20, y: 450 },
  });
});

test('Drawer keeps focus and scroll, closes on Escape and on the backdrop @phone', async ({ page, ai }) => {
  void ai;
  await page.goto('/#/read');
  const opener = page.getByRole('button', { name: 'Menu', exact: true });
  const panel = dialogs(page);
  await checkOverlay(page, {
    opener,
    open: () => opener.click(),
    panel,
    inside: panel.getByRole('heading').first(),
    // The drawer is 288px wide on a 360px screen.
    backdrop: { x: 340, y: 400 },
  });
});

test('Escape closes only the topmost overlay and the page stays locked until the last one closes', async ({ page }) => {
  // A saved word: its details Sheet opens a confirmation Dialog on top of it.
  await seed(page, 'en', 'light', 1);
  await page.goto('/#/words/all');
  await makePageScrollable(page);
  const behind = { x: 20, y: 450 };
  // Both are located by attribute: an open modal dialog hides the sheet below it from role queries.
  const sheet = page.locator('[role="dialog"][aria-label="test-a"]');
  const confirm = page.locator('[role="dialog"][aria-label="Delete card and history"]');

  const row = page.getByRole('button', { name: 'test-a', exact: true });
  await row.click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Delete card and history' }).click();
  await expect(confirm).toBeVisible();
  await expectFocusIn(confirm);
  await expectPageLocked(page, behind);

  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await frames(page);
  await expect(sheet).toBeVisible();
  await expectFocusIn(sheet);
  await expectPageLocked(page, behind);

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(row).toBeFocused();
  await expectPageScrolls(page, behind);
});
