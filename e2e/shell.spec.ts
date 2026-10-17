/**
 * The app shell: hash routes (Back, reload, deep links, not-found), the collapsible sidebar,
 * Settings as a page with sections that save on their own, and a key request that lands on
 * Settings → Text AI. Every AI call is answered from fixtures.
 */
import { expect, layout, openArticle, overflowing, settled, test } from './fixtures';
import type { Page } from '@playwright/test';

// `ai` onboards the app with a test key and answers every AI request from fixtures.
test.beforeEach(async ({ ai }) => {
  ai.ttsDelayMs = 50;
});

const sidebar = (page: Page) => page.locator('[data-sidebar]');
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test.describe('sidebar', () => {
  test('collapses to a rail and expands again, and remembers it across reloads', async ({ page }) => {
    await page.goto('/');
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'expanded');
    await expect(sidebar(page).getByRole('link', { name: 'My study' })).toContainText('My study');
    expect((await sidebar(page).boundingBox())!.width).toBe(240);

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'rail');
    expect((await sidebar(page).boundingBox())!.width).toBe(56);
    // Icon only: the label is the tooltip and the accessible name.
    const read = sidebar(page).getByRole('link', { name: 'Read', exact: true });
    await expect(read).toHaveAttribute('title', 'Read');
    await expect(read).not.toContainText('Read');
    expect(await stored(page, 'relire_sidebar')).toBe('collapsed');

    await page.reload();
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'rail');

    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'expanded');
    await page.reload();
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'expanded');
  });

  test('lists the sub-pages of the current area, indented', async ({ page }) => {
    await page.goto('/#/study/shadowing');
    const nav = sidebar(page);
    await expect(nav.getByRole('link', { name: 'Shadowing' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Words' })).toBeVisible();

    await nav.getByRole('link', { name: 'Words' }).click();
    await expect(page).toHaveURL(/#\/study\/words$/);
    await expect(nav.getByRole('link', { name: 'Words' })).toHaveAttribute('aria-current', 'page');

    // Another area closes them, and Settings lists its sections.
    await nav.getByRole('link', { name: 'Progress' }).click();
    await expect(nav.getByRole('link', { name: 'Words' })).toHaveCount(0);
    await nav.getByRole('link', { name: 'Settings', exact: true }).click();
    for (const name of ['Text AI', 'Speech', 'Prompts', 'Data and backup', 'About'])
      await expect(nav.getByRole('link', { name })).toBeVisible();
    // "Practice" names both the area and its settings section; the section has its own address.
    await expect(nav.locator('a[href="#/settings/practice"]')).toBeVisible();
  });

  test('the reader starts with the sidebar collapsed, and opening it there is not remembered', async ({ page }) => {
    await page.goto('/');
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'expanded');
    await openArticle(page);
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'rail');

    // The rail takes room beside the article; it never sits over the text.
    const rail = (await sidebar(page).boundingBox())!;
    const text = (await page.locator('article').boundingBox())!;
    expect(text.x).toBeGreaterThanOrEqual(rail.x + rail.width);

    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'expanded');
    const wide = (await sidebar(page).boundingBox())!;
    expect((await page.locator('article').boundingBox())!.x).toBeGreaterThanOrEqual(wide.x + wide.width);
    expect(await stored(page, 'relire_sidebar')).toBeNull();

    // Leaving the reader restores the learner's own choice; coming back collapses it again.
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'expanded');
    await page.getByText('Le Petit Prince').first().click();
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'rail');
  });
});

test.describe('routes', () => {
  test('Back and reload keep the place: library, article, Back', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/#\/read$/);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

    await page.getByText('Le Petit Prince').first().click();
    await expect(page).toHaveURL(/#\/read\/.+/);
    await expect(page.locator('article [data-sentence]').first()).toBeVisible();

    await page.reload();
    await expect(page.locator('article [data-sentence]').first()).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/#\/read$/);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

    await page.goForward();
    await expect(page.locator('article [data-sentence]').first()).toBeVisible();
  });

  test('resolving a default replaces the entry instead of adding one', async ({ page }) => {
    await page.goto('/#/study');
    await expect(page).toHaveURL(/#\/study\/words$/);
    await page.getByRole('link', { name: 'Progress' }).click();
    await expect(page).toHaveURL(/#\/progress$/);

    await page.goBack();
    await expect(page).toHaveURL(/#\/study\/words$/);
    // One more Back leaves the app; there is no `#/study` entry in between.
    await page.goBack();
    expect(page.url()).not.toContain('#/study');
  });

  test('the study tab lives in the address, so it survives a reload and Back', async ({ page }) => {
    await page.goto('/#/study/words');
    await page.getByRole('radio', { name: 'Shadowing' }).click();
    await expect(page).toHaveURL(/#\/study\/shadowing$/);
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Shadowing' })).toBeChecked();
    expect(await stored(page, 'relire_study_tab')).toBeNull();
    await page.goBack();
    await expect(page.getByRole('radio', { name: 'Words' })).toBeChecked();
  });

  test('a settings section can be opened by its address and survives a reload', async ({ page }) => {
    await page.goto('/#/settings/prompts');
    await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'Prompts' })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible();

    await sidebar(page).getByRole('link', { name: 'Speech' }).click();
    await expect(page).toHaveURL(/#\/settings\/speech$/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/settings\/prompts$/);
    await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible();
  });

  test('the bare Settings address opens the first section on a wide screen', async ({ page }) => {
    await page.goto('/#/settings');
    await expect(page).toHaveURL(/#\/settings\/text-ai$/);
    await expect(page.getByRole('heading', { name: 'Text AI' })).toBeVisible();
  });

  test('an unknown address and a missing article show a way back to the library', async ({ page }) => {
    await page.goto('/#/nowhere/at/all');
    await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to the library' }).click();
    await expect(page).toHaveURL(/#\/read$/);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

    await page.goto('/#/read/no-such-article');
    await expect(page.getByText('That article is not in your library.')).toBeVisible();
    await page.getByRole('link', { name: 'Go to the library' }).click();
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  });
});

test.describe('settings sections save on their own', () => {
  test('Text AI saves its own changes with a visible result, and Speech stays as it was', async ({ page }) => {
    await page.goto('/#/settings/text-ai');
    const key = page.getByPlaceholder('Paste your key here');
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();

    await key.fill('TEST-2');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await expect(save).toBeEnabled();
    const before = await layout(page, 'main');
    await save.click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(save).toBeDisabled();
    expect(await layout(page, 'main')).toEqual(before);
    expect(JSON.parse((await stored(page, 'relire_app_settings_v1'))!).apiKeys.gemini).toBe('TEST-2');

    // Edits in one section survive moving to another, and saving it does not save the first.
    await key.fill('TEST-3');
    await sidebar(page).getByRole('link', { name: 'Speech' }).click();
    await page.getByRole('button', { name: /Zephyr/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const settings = JSON.parse((await stored(page, 'relire_app_settings_v1'))!);
    expect(settings.speechVoice).toBe('Zephyr');
    expect(settings.apiKeys.gemini).toBe('TEST-2');
    await sidebar(page).getByRole('link', { name: 'Text AI' }).click();
    await expect(key).toHaveValue('TEST-3');
  });

  test('a save the browser refuses is reported as failed, not as saved', async ({ page }) => {
    await page.goto('/#/settings/text-ai');
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error('quota');
      };
    });
    await page.getByPlaceholder('Paste your key here').fill('TEST-4');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Could not save');
    await expect(page.getByText('Saved', { exact: true })).toHaveCount(0);
  });

  test('prompt edits save in the Prompts section and can be reset', async ({ page }) => {
    await page.goto('/#/settings/prompts');
    const editor = page.getByRole('textbox', { name: 'Word analysis' });
    await editor.fill('Mon prompt {{word}}');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(JSON.parse((await stored(page, 'relire_prompts_v1'))!).word.en).toBe('Mon prompt {{word}}');

    await page.reload();
    await expect(editor).toHaveValue('Mon prompt {{word}}');
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(await stored(page, 'relire_prompts_v1')).toBeNull();
  });
});

test.describe('a key request', () => {
  test.beforeEach(async ({ page }) => {
    // No key: the first AI feature asks for one.
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {} })));
    await page.reload();
  });

  test('lands on Settings → Text AI with the key field focused, and leads back after a check', async ({ page, ai }) => {
    await page.getByText('Le Petit Prince').first().click();
    await expect(page.locator('article [data-sentence]').first()).toBeVisible();
    const article = page.url();

    await page.locator('article [data-reader-word]').first().click();
    await expect(page).toHaveURL(/#\/settings\/text-ai$/);
    const key = page.getByPlaceholder('Paste your key here');
    await expect(key).toBeFocused();
    await expect(page.getByText('Add your API key to use word and sentence analysis')).toBeVisible();
    const goBack = page.getByRole('button', { name: 'Go back to where you were' });
    await expect(goBack).toBeDisabled();

    await key.fill('NEW-KEY');
    await page.getByRole('button', { name: 'Check and save' }).click();
    await expect(page.getByText('Key works. Saved.')).toBeVisible();
    expect(ai.calls.word).toBeGreaterThan(0);
    await expect(goBack).toBeEnabled();
    expect(JSON.parse((await stored(page, 'relire_app_settings_v1'))!).apiKeys.gemini).toBe('NEW-KEY');

    await goBack.click();
    expect(page.url()).toBe(article);
    await expect(page.locator('article [data-sentence]').first()).toBeVisible();
    await expect(page.getByText('Add your API key to turn on')).toHaveCount(0);
  });

  test('a key that fails the check is not saved, and the real reason is shown', async ({ page, ai }) => {
    ai.fail(['word']);
    await page.getByRole('button', { name: 'Add key' }).click();
    await expect(page).toHaveURL(/#\/settings\/text-ai$/);
    await expect(page.getByPlaceholder('Paste your key here')).toBeFocused();

    await page.getByPlaceholder('Paste your key here').fill('BAD-KEY');
    await page.getByRole('button', { name: 'Check and save' }).click();
    await expect(page.getByRole('alert')).toContainText('Key check failed');
    expect(JSON.parse((await stored(page, 'relire_app_settings_v1'))!).apiKeys).toEqual({});
  });
});

test.describe('layout', () => {
  const routes = [
    '#/read',
    '#/study/words',
    '#/study/shadowing',
    '#/practice',
    '#/progress',
    '#/settings/text-ai',
    '#/settings/speech',
    '#/settings/practice',
    '#/settings/prompts',
    '#/settings/data',
    '#/settings/about',
    '#/nowhere',
  ];

  async function checkRoutes(page: Page) {
    for (const route of routes) {
      await page.goto('/' + route);
      await settled(page);
      expect(await overflowing(page.locator('body')), route).toEqual([]);
      const first = await layout(page, 'main');
      expect(first.width, route).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.waitForTimeout(300);
      expect(await layout(page, 'main'), `${route} moved after loading`).toEqual(first);
    }
  }

  test('no horizontal overflow and nothing moves after loading, at 1280px', async ({ page }) => {
    await checkRoutes(page);
    await openArticle(page);
    expect(await overflowing(page.locator('body'))).toEqual([]);
  });

  test('no horizontal overflow and nothing moves after loading, at 360px @phone', async ({ page }) => {
    await checkRoutes(page);
    await openArticle(page);
    expect(await overflowing(page.locator('body'))).toEqual([]);
  });

  test('collapsing the sidebar does not move the header or add a scrollbar', async ({ page }) => {
    await page.goto('/#/read');
    await settled(page);
    const before = await layout(page, 'main');
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await settled(page);
    const after = await layout(page, 'main');
    expect(after.top).toBe(before.top);
    expect(after.width).toBe(before.width);
  });
});

test.describe('between md and lg', () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test('the sidebar is a rail that cannot expand; Settings lists its sections beside the page', async ({ page }) => {
    await page.goto('/#/settings/speech');
    await expect(sidebar(page)).toHaveAttribute('data-sidebar', 'rail');
    await expect(page.getByRole('button', { name: /sidebar/ })).toHaveCount(0);
    expect(await overflowing(page.locator('body'))).toEqual([]);

    await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Prompts' }).click();
    await expect(page).toHaveURL(/#\/settings\/prompts$/);
    await expect(page.getByRole('heading', { name: 'Prompts' })).toBeVisible();
  });
});

test.describe('phones', () => {
  test('the menu button opens a drawer with the same tree @phone', async ({ page }) => {
    await page.goto('/#/study/words');
    await expect(page.locator('[data-sidebar]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    for (const name of ['Read', 'My study', 'Words', 'Shadowing', 'Practice', 'Progress', 'Settings'])
      await expect(drawer.getByRole('link', { name, exact: true })).toBeVisible();
    await drawer.getByRole('link', { name: 'Shadowing', exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/#\/study\/shadowing$/);
  });

  test('Settings is a list of sections, then the section, with a way back @phone', async ({ page }) => {
    await page.goto('/#/settings');
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('link', { name: /^Speech/ }).click();
    await expect(page).toHaveURL(/#\/settings\/speech$/);
    await expect(page.getByRole('heading', { name: 'Speech' })).toBeVisible();
    expect(await overflowing(page.locator('body'))).toEqual([]);

    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('link', { name: /^Text AI/ })).toBeVisible();
  });
});
