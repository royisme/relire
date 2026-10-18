/** Owns Add exercises, generation and set-list integration coverage; provider replies are mocked. */
import { expect, openArticle, settled, test } from './fixtures';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import {
  PRACTICE,
  openGenerator,
  openListedUnit,
  openUnit,
  seedUnits,
  stored,
  waitForArticle,
} from './practice.helpers';

type Db = typeof import('../src/storage/db');
const main = (page: import('@playwright/test').Page) => page.getByRole('main');
const make = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Make exercises from this article', exact: true });
const setLinks = (page: import('@playwright/test').Page) => page.locator('main tbody a[href^="#/practice/set/"]');

test.beforeEach(async ({ ai }) => {
  ai.ttsDelayMs = 50;
});

test('empty state and Add dialog offer both choices; worksheet choice opens the import route', async ({ page }) => {
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await expect(page.getByText('0 exercise sets', { exact: true })).toBeVisible();
  await expect(page.getByText('No exercise sets yet', { exact: true })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Import a worksheet', exact: true })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Make from an article', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.locator('main button.bg-accent-700')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toHaveClass(/bg-surface/);
  await page.getByRole('button', { name: 'Add exercises', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add exercises' });
  await expect(dialog.getByRole('button', { name: 'Make from an article', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import a worksheet', exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/exercises$/);
});

test('generation has its own article, level and size; saving closes the dialog and lists one independent set', async ({
  page,
  ai,
}) => {
  await page.goto(PRACTICE);
  await waitForArticle(page);
  const dialog = await openGenerator(page);
  await expect(dialog.getByRole('combobox', { name: 'Article', exact: true }).locator('option')).toHaveCount(3);
  await expect(dialog.getByRole('combobox', { name: 'Level', exact: true })).toHaveValue('B1');
  await expect(dialog.getByRole('spinbutton', { name: 'Items', exact: true })).toHaveValue('8');
  await make(page).click();
  await expect(dialog).not.toBeVisible();
  await expect(setLinks(page)).toHaveCount(1);
  await expect(setLinks(page)).toContainText('Le Petit Prince et le Secret du Renard');
  await expect(setLinks(page)).toContainText('11 exercises');
  await expect(page.locator('main tbody tr')).toContainText('Not started');
  expect(ai.prompts.exercises).toHaveLength(1);
  expect(ai.prompts.exercises[0]).toContain('Tu seras pour moi unique au monde');
  expect(ai.prompts.exercises[0]).toContain('CEFR level B1');
  expect(ai.prompts.exercises[0]).toContain('Write 8 exercise items');
  const { units } = await stored(page);
  expect(units).toHaveLength(11);
  expect(new Set(units.map((unit) => unit.setId)).size).toBe(1);
  for (const unit of units) {
    expect(unit.setTitle).toBe('Le Petit Prince et le Secret du Renard');
    expect(unit.level).toBe('B1');
    expect(unit).not.toHaveProperty('materialId');
    expect(CATALOG_EXERCISES.units.map((u) => u.id)).not.toContain(unit.id);
    expect(unit.items.every((item) => item.answerSource === 'ai')).toBe(true);
    expect(JSON.stringify(unit)).not.toContain('articleQuote');
  }
  await openGenerator(page);
  await make(page).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(setLinks(page)).toHaveCount(2);
  const both = (await stored(page)).units;
  expect(new Set(both.map((unit) => unit.setId)).size).toBe(2);
  expect(both.map((unit) => unit.unitNumber).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 22 }, (_, index) => Math.floor(index / 2) + 1),
  );
});

test('generation working state keeps the button size and the underlying page still', async ({ page, ai }) => {
  ai.answer({
    exercises: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return CATALOG_EXERCISES;
    },
  });
  await page.goto(PRACTICE);
  await waitForArticle(page);
  const heading = page.getByRole('heading', { name: 'Practice', exact: true });
  await settled(page);
  const beforePage = await heading.boundingBox();
  await openGenerator(page);
  const button = make(page);
  await settled(page);
  const before = await button.boundingBox();
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Making exercises from the article…')).toBeVisible();
  expect(await button.boundingBox()).toEqual(before);
  expect(await heading.boundingBox()).toEqual(beforePage);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(setLinks(page)).toHaveCount(1);
});

test('unsupported items are left out before the saved set appears', async ({ page, ai }) => {
  const units = CATALOG_EXERCISES.units.map((unit) =>
    unit.id === 'unit-fill-blanks'
      ? {
          ...unit,
          items: unit.items.map((item) =>
            item.id === 'fb-1' ? { ...item, articleQuote: 'Je ne mange pas de chapeau' } : item,
          ),
        }
      : unit.id === 'unit-open-qa'
        ? { ...unit, items: unit.items.map((item) => ({ ...item, articleQuote: 'Le renard parle du chapeau' })) }
        : unit,
  );
  ai.answer({ exercises: { units } });
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await openGenerator(page);
  await make(page).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(setLinks(page)).toContainText('10 exercises');
  const { units: saved } = await stored(page);
  expect(saved).toHaveLength(10);
  const kept = saved.find((unit) => unit.title === 'Conjuguer au présent et au futur');
  expect(kept?.items.map((item) => item.itemNumber)).toEqual([1]);
});

test('unusable AI output shows the real reason and saves nothing', async ({ page, ai }) => {
  const unit = CATALOG_EXERCISES.units.find((u) => u.id === 'unit-fill-blanks')!;
  ai.answer({
    exercises: { units: [{ ...unit, items: unit.items.map((item) => ({ ...item, articleQuote: 'Un chapeau' })) }] },
  });
  await page.goto(PRACTICE);
  await waitForArticle(page);
  const dialog = await openGenerator(page);
  await make(page).click();
  await expect(dialog.getByRole('alert')).toContainText('The AI answer could not be used');
  await expect(dialog.getByRole('alert')).toContainText('quotes words that are not in the article');
  expect((await stored(page)).units).toEqual([]);
  await expect(make(page)).toBeEnabled();
});

test('a failed request stays in the dialog with the real reason', async ({ page, ai }) => {
  ai.fail(['exercises']);
  await page.goto(PRACTICE);
  await waitForArticle(page);
  const dialog = await openGenerator(page);
  await make(page).click();
  await expect(dialog.getByRole('alert')).toContainText('exercises failed');
  expect((await stored(page)).units).toEqual([]);
});

test('without a key generation opens Settings → Text AI', async ({ page }) => {
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await page.evaluate(() => localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {} })));
  await page.reload();
  await waitForArticle(page);
  await openGenerator(page);
  await make(page).click();
  await expect(page).toHaveURL(/#\/settings\/ai\/text\?key=1/);
  await expect(page.getByPlaceholder('Paste your key here')).toBeFocused();
});

test('without articles generation offers the Library link and oral practice is absent', async ({ page }) => {
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    await (await db()).clear('articles');
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Read aloud' })).toHaveCount(0);
  const dialog = await openGenerator(page);
  await expect(dialog.getByText('Add an article first', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Go to library' })).toBeVisible();
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
});

test('reader entry and independent oral article picker keep one Practice address', async ({ page }) => {
  await openArticle(page);
  await page.getByRole('link', { name: 'Make exercises', exact: true }).click();
  await expect(page).toHaveURL(/#\/practice$/);
  const oral = page.getByRole('region', { name: 'Read aloud' });
  await oral.getByRole('combobox', { name: 'Article', exact: true }).selectOption({ index: 1 });
  const chosen = await oral.getByRole('combobox').inputValue();
  const dialog = await openGenerator(page);
  await dialog.getByRole('combobox', { name: 'Article', exact: true }).selectOption({ index: 2 });
  await page.keyboard.press('Escape');
  await expect(oral.getByRole('combobox')).toHaveValue(chosen);
  await expect(page).toHaveURL(/#\/practice$/);
  await expect(oral.getByText(/^Sentence 1 of \d+$/)).toBeVisible();
  await oral.getByRole('button', { name: 'Next sentence' }).click();
  await expect(oral.getByText(/^Sentence 2 of \d+$/)).toBeVisible();
});

test('a missing unit offers Practice', async ({ page }) => {
  await page.goto('/#/practice/nope');
  await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to Practice' }).click();
  await expect(page).toHaveURL(/#\/practice$/);
});

test('sidebar shows the open set and only its exercises, with the current page marked', async ({ page }) => {
  await seedUnits(page);
  await seedUnits(page, [
    { ...CATALOG_EXERCISES.units[0], id: 'other-unit', setId: 'set-2', setTitle: 'Other set', title: 'Other exercise' },
  ]);
  await page.goto(PRACTICE);
  const nav = page.locator('[data-sidebar]');
  await expect(nav.getByRole('link', { name: 'Le genre des noms', exact: true })).toHaveCount(0);
  await openListedUnit(page, 'set-1', 'unit-gender-check');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(nav.getByRole('link', { name: 'Le genre des noms', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.locator('a[href="#/practice/set/set-1"]')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Other exercise', exact: true })).toHaveCount(0);
  await nav.locator('a[href="#/practice/set/set-1"]').click();
  await expect(nav.locator('a[href="#/practice/set/set-1"]')).toHaveAttribute('aria-current', 'page');
});

test('sets use their title or translated type and id, with their own level', async ({ page }) => {
  await seedUnits(page, [
    { ...CATALOG_EXERCISES.units[0], setTitle: 'Leçon 1', level: 'C1' },
    { ...CATALOG_EXERCISES.units[1], setId: 'aaaa-set', level: 'A2' },
  ]);
  await page.goto(PRACTICE);
  await expect(page.locator('main tbody tr').filter({ hasText: 'Leçon 1' })).toContainText('C1');
  await expect(page.locator('main tbody tr').filter({ hasText: 'Fill in the blanks · aaaa' })).toContainText('A2');
});

test('set progress is the sum of stored checked items; the set page shows exercise progress', async ({ page }) => {
  await seedUnits(page);
  await openUnit(page, 'unit-word-transform', 'Le féminin des adjectifs');
  const item = page.getByRole('listitem').filter({ hasText: 'intrigué' });
  await item.getByRole('textbox').fill('intriguée');
  await item.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(item.getByText('Correct', { exact: true })).toBeAttached();
  await page.goto(PRACTICE);
  await expect(page.locator('main tbody tr')).toContainText('1 of 15 checked');
  await setLinks(page).click();
  await expect(page.locator('main tbody tr').filter({ hasText: 'Le féminin des adjectifs' })).toContainText(
    '1 of 1 checked',
  );
  await expect(page.locator('main tbody tr').filter({ hasText: 'Conjuguer au présent' })).toContainText('Not started');
});

test('a generated set stays when its source article is deleted', async ({ page }) => {
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await openGenerator(page);
  await make(page).click();
  await expect(setLinks(page)).toHaveCount(1);
  await page.evaluate(async () => {
    const { deleteArticleData }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    await deleteArticleData('petit-prince');
  });
  await page.reload();
  await expect(setLinks(page)).toHaveCount(1);
  expect((await stored(page)).units).toHaveLength(11);
});
