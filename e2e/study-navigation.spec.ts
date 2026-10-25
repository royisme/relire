/** Speaking owns one sidebar child, Read aloud; Recordings is a page reached from Speaking. About is independent, and filters remain keyboard-operable radios. */
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

async function speakingLinks(page: Page, rail = false) {
  const sidebar = page.locator('[data-sidebar]');
  const main = page.getByRole('main');
  await expect(sidebar.getByRole('link', { name: 'Speaking', exact: true })).toHaveAttribute(
    'aria-current',
    rail ? 'page' : 'true',
  );
  await expect(sidebar.getByRole('link', { name: 'My study', exact: true })).toHaveCount(0);
  await expect(page.locator('a[href^="#/study"]')).toHaveCount(0);
  // Read aloud is Speaking's only sidebar child; Recordings is a page link, never a row.
  await expect(sidebar.locator('a[href^="#/speaking/"]')).toHaveCount(rail ? 0 : 1);
  await expect(sidebar.getByRole('link', { name: 'Recordings', exact: true })).toHaveCount(0);
  const readAloud = sidebar.getByRole('link', { name: 'Read aloud', exact: true });
  await expect(readAloud).toHaveCount(rail ? 0 : 1);
  if (!rail) {
    await expect(readAloud).toBeVisible();
    await expect(readAloud).toHaveAttribute('href', '#/speaking/read-aloud');
    await expect(readAloud).not.toHaveAttribute('aria-current');
    await touchTarget(readAloud);
  }
  const back = main.getByRole('link', { name: 'Speaking', exact: true });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '#/speaking');
  await touchTarget(back);
  await expect(
    main.getByRole('radio', { name: /^(Words|Shadowing|Mistakes|Grammar|Read aloud|Recordings)$/ }),
  ).toHaveCount(0);
  expect(await overflowing(page.locator('body'))).toEqual([]);
}

test('Read aloud is the only Speaking sidebar child; Recordings keeps its back link on the rail and tablet', async ({
  page,
}) => {
  await page.goto('/#/speaking/recordings');
  await speakingLinks(page);
  const collapse = page.getByRole('button', { name: 'Collapse sidebar' });
  await touchTarget(collapse);
  await expect(collapse).toHaveAttribute('title', 'Collapse sidebar');
  await expect(collapse).toHaveText('');
  const buttonBox = (await collapse.boundingBox())!;
  const firstRow = (await page
    .locator('[data-sidebar]')
    .getByRole('link', { name: 'Reading', exact: true })
    .boundingBox())!;
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(firstRow.y);
  await collapse.click();
  await speakingLinks(page, true);
  await page.getByRole('link', { name: 'Mistakes', exact: true }).click();
  await expect(page).toHaveURL(/#\/mistakes$/);
  await expect(page.getByRole('link', { name: 'Mistakes', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.locator('[data-sidebar]').getByRole('link', { name: 'Speaking', exact: true }).click();
  await page.getByRole('main').getByRole('link', { name: 'Recordings', exact: true }).click();
  await expect(page).toHaveURL(/#\/speaking\/recordings$/);
  await speakingLinks(page, true);
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await speakingLinks(page);
  await page.setViewportSize({ width: 900, height: 800 });
  await speakingLinks(page, true);
});

test('Grammar opens Topics and switches to its distinct Conjugation address', async ({ page }) => {
  await page.goto('/#/grammar');
  await expect(page).toHaveURL(/#\/grammar$/);
  await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible();
  await expect(page.getByText('No topics are published yet.', { exact: true })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Conjugation', exact: true }).click();
  await expect(page).toHaveURL(/#\/grammar\/conjugation$/);
  await expect(page.getByRole('heading', { name: 'Conjugation', exact: true })).toBeVisible();
  await expect(page.locator('a[href="#/study/grammar"]')).toHaveCount(0);
  await page.locator('[data-sidebar]').getByRole('link', { name: 'Speaking', exact: true }).click();
  await page.getByRole('main').getByRole('link', { name: 'Recordings', exact: true }).click();
  await expect(page).toHaveURL(/#\/speaking\/recordings$/);
  await expect(page.locator('[data-sidebar]').getByRole('link', { name: 'Speaking', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.locator('[data-sidebar]').getByRole('link', { name: 'Recordings', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Grammar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/speaking\/recordings$/);
});

test('About is the final footer link, not a Settings section', async ({ page }) => {
  await page.goto('/#/settings/ai/text');
  const sidebar = page.locator('[data-sidebar]');
  await expect(sidebar.locator('a[href^="#/settings/"]')).toHaveCount(5);
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

test('phone Recordings survives reload and Back; the drawer has About last and no collapse control @phone', async ({
  page,
}) => {
  await page.goto('/#/speaking/recordings');
  const back = page.getByRole('main').getByRole('link', { name: 'Speaking', exact: true });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '#/speaking');
  await touchTarget(back);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Mistakes', exact: true }).click();
  await expect(page).toHaveURL(/#\/mistakes$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mistakes', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'My study', exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/#\/speaking\/recordings$/);
  await expect(back).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/#\/speaking\/recordings$/);
  await expect(back).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Grammar', exact: true }).click();
  await expect(page).toHaveURL(/#\/grammar$/);
  await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/speaking\/recordings$/);
  await expect(back).toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu', exact: true });
  await expect(drawer.getByRole('link', { name: 'My study', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: 'Recordings', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: 'Speaking', exact: true })).toHaveAttribute('aria-current', 'true');
  const readAloud = drawer.getByRole('link', { name: 'Read aloud', exact: true });
  await expect(readAloud).toHaveAttribute('href', '#/speaking/read-aloud');
  await expect(readAloud).not.toHaveAttribute('aria-current');
  await expect(drawer.getByRole('button', { name: /sidebar/ })).toHaveCount(0);
  await expect(drawer.getByRole('link').last()).toHaveAttribute('href', '#/about');
  await drawer.getByRole('link', { name: 'About', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByRole('main').getByRole('link', { name: /About/ })).toHaveCount(0);
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

for (const [lang, readAloud, recordings] of [
  ['zh', '朗读', '跟读录音'],
  ['en', 'Read aloud', 'Recordings'],
] as const) {
  test(`Speaking's single drawer child fits a 360px phone in ${lang === 'zh' ? 'Chinese' : 'English'} without scrolling @phone`, async ({
    page,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('relire_lang', value), lang);
    await page.goto('/#/speaking/recordings');
    expect(await overflowing(page.locator('body'))).toEqual([]);
    await page.getByRole('button', { name: lang === 'zh' ? '菜单' : 'Menu', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: lang === 'zh' ? '菜单' : 'Menu', exact: true });
    const child = drawer.getByRole('link', { name: readAloud, exact: true });
    await expect(child).toBeVisible();
    // Read aloud is Speaking's only drawer child, never current on the recordings page.
    await expect(drawer.locator('a[href^="#/speaking/"]')).toHaveCount(1);
    await expect(drawer.getByRole('link', { name: recordings, exact: true })).toHaveCount(0);
    await expect(child).not.toHaveAttribute('aria-current');
    await page.evaluate(() => document.fonts.ready);
    expect(await drawer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // The child lies inside the drawer and the screen, with no clipped text.
    const strip = (await drawer.boundingBox())!;
    const box = (await child.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(strip.x);
    expect(box.x + box.width).toBeLessThanOrEqual(strip.x + strip.width);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(await overflowing(child)).toEqual([]);
    expect(await overflowing(page.locator('body'))).toEqual([]);
  });
}
