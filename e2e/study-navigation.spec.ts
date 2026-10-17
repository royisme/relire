/** Study links have one visible home; About is independent, and filters remain keyboard-operable radios. */
import { expect, overflowing, test } from './fixtures';
import type { Locator, Page } from '@playwright/test';

test.beforeEach(async ({ ai }) => {
  ai.ttsDelayMs = 50;
});

async function touchTarget(control: Locator) {
  const box = (await control.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(40);
  expect(box.height).toBeGreaterThanOrEqual(40);
}

async function studyLinks(page: Page, location: 'sidebar' | 'page', active: string) {
  const sidebar = page.locator('[data-sidebar]');
  const main = page.getByRole('main');
  for (const name of ['Words', 'Shadowing', 'Mistakes']) {
    const link = page.getByRole('link', { name, exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `#/study/${name.toLowerCase()}`);
    await expect((location === 'sidebar' ? sidebar : main).getByRole('link', { name, exact: true })).toBeVisible();
    if (name === active) await expect(link).toHaveAttribute('aria-current', 'page');
    else await expect(link).not.toHaveAttribute('aria-current');
    await touchTarget(link);
  }
  await expect(main.getByRole('radio', { name: /^(Words|Shadowing|Mistakes)$/ })).toHaveCount(0);
  expect(await overflowing(page.locator('body'))).toEqual([]);
}

test('expanded, collapsed and tablet study pages keep just one visible set of page links', async ({ page }) => {
  await page.goto('/#/study/shadowing');
  await studyLinks(page, 'sidebar', 'Shadowing');
  const collapse = page.getByRole('button', { name: 'Collapse sidebar' });
  await touchTarget(collapse);
  await expect(collapse).toHaveAttribute('title', 'Collapse sidebar');
  await expect(collapse).toHaveText('');
  const buttonBox = (await collapse.boundingBox())!;
  const firstRow = (await page
    .locator('[data-sidebar]')
    .getByRole('link', { name: 'Read', exact: true })
    .boundingBox())!;
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(firstRow.y);
  await collapse.click();
  await studyLinks(page, 'page', 'Shadowing');
  await page.getByRole('link', { name: 'Mistakes', exact: true }).click();
  await studyLinks(page, 'page', 'Mistakes');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await studyLinks(page, 'sidebar', 'Mistakes');
  await page.setViewportSize({ width: 900, height: 800 });
  await studyLinks(page, 'page', 'Mistakes');
});

test('About is the final footer link, not a Settings section, including the old deep link', async ({ page }) => {
  await page.goto('/#/settings/ai/text');
  const sidebar = page.locator('[data-sidebar]');
  await expect(sidebar.locator('a[href^="#/settings/"]')).toHaveCount(4);
  await expect(sidebar.locator('a[href="#/settings/about"]')).toHaveCount(0);
  const about = sidebar.getByRole('link', { name: 'About', exact: true });
  await expect(sidebar.getByRole('link').last()).toHaveAttribute('href', '#/about');
  await about.click();
  await expect(page).toHaveURL(/#\/about$/);
  await expect(about).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible();
  await expect(page.getByText('There is no account and no app server.', { exact: false })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Settings', exact: true })).not.toHaveAttribute('aria-current');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible();
  await page.goto('/#/settings/about');
  await expect(page).toHaveURL(/#\/about$/);
  await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible();
  await about.click();
  await sidebar.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/#\/about$/);
  await expect(sidebar.locator('a[href^="#/settings/"]')).toHaveCount(0);
});

test('Library level filters have one Tab stop, all arrow keys and Home/End', async ({ page }) => {
  await page.goto('/#/read');
  const group = page.getByRole('radiogroup');
  const radios = group.getByRole('radio');
  await expect(radios.nth(1)).toBeVisible();
  await expect(group.locator('[tabindex="0"]')).toHaveCount(1);
  for (const radio of await radios.all()) await touchTarget(radio);
  const first = radios.first();
  const last = radios.last();
  await first.focus();
  await first.press('ArrowLeft');
  await expect(last).toBeFocused();
  await expect(last).toBeChecked();
  await last.press('ArrowDown');
  await expect(first).toBeFocused();
  await expect(first).toBeChecked();
  await first.press('ArrowRight');
  await expect(radios.nth(1)).toBeFocused();
  await radios.nth(1).press('ArrowUp');
  await expect(first).toBeFocused();
  await first.press('End');
  await expect(last).toBeFocused();
  await last.press('Home');
  await expect(first).toBeChecked();
  await expect(first).toBeFocused();
  await expect(group.locator('[tabindex="0"]')).toHaveCount(1);
  await first.press('Tab');
  await expect(group.locator(':focus')).toHaveCount(0);
});

test('phone study links stay local; the drawer has About last and no collapse control @phone', async ({ page }) => {
  await page.goto('/#/study/words');
  await studyLinks(page, 'page', 'Words');
  await page.getByRole('link', { name: 'Mistakes', exact: true }).click();
  await expect(page).toHaveURL(/#\/study\/mistakes$/);
  await page.reload();
  await studyLinks(page, 'page', 'Mistakes');
  await page.goBack();
  await studyLinks(page, 'page', 'Words');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu', exact: true });
  await expect(drawer.getByRole('button', { name: /sidebar/ })).toHaveCount(0);
  await expect(drawer.getByRole('link').last()).toHaveAttribute('href', '#/about');
  await drawer.getByRole('link', { name: 'About', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByRole('main').getByRole('link', { name: /About/ })).toHaveCount(0);
  await page.goto('/#/settings/about');
  await expect(page).toHaveURL(/#\/about$/);
  expect(await overflowing(page.locator('body'))).toEqual([]);
});

test('phone Library filters retain 40px radio targets and selection @phone', async ({ page }) => {
  await page.goto('/#/read');
  const radios = page.getByRole('radiogroup').getByRole('radio');
  await expect(radios.nth(1)).toBeVisible();
  for (const radio of await radios.all()) await touchTarget(radio);
  await radios.nth(1).tap();
  await expect(radios.nth(1)).toBeChecked();
  await expect(radios.nth(1)).toHaveAttribute('tabindex', '0');
  expect(await overflowing(page.locator('body'))).toEqual([]);
});
