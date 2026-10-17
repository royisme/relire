/**
 * Practice page: making exercises from an article (the AI is mocked with the shared
 * catalogue), the units it lists with real progress, the reader's entry point, the sidebar
 * list, a missing unit and a missing key.
 */
import { expect, openArticle, test } from './fixtures';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import { PRACTICE, openUnit, seedUnits, stored, waitForArticle } from './practice.helpers';

type Db = typeof import('../src/storage/db');

// `ai` onboards the app with a test key and answers the exercises task with CATALOG_EXERCISES,
// which the catalogue wrote against the sample article (CATALOG_ARTICLE, "petit-prince").
test.beforeEach(async ({ ai }) => {
  ai.ttsDelayMs = 50;
});

const main = (page: import('@playwright/test').Page) => page.getByRole('main');
const make = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Make exercises from this article' });
const catalogueIds = CATALOG_EXERCISES.units.map((unit) => unit.id);

test('makes exercises from the article, saves them with fresh ids and lists them', async ({ page, ai }) => {
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
  await expect(page.getByText('No exercises from this article yet.')).toBeVisible();

  await make(page).click();
  await expect(main(page).getByRole('link', { name: /Le féminin des adjectifs/ })).toBeVisible();
  await expect(page.getByText('Made 15 items. They are in the list below.')).toBeVisible();
  await expect(page.getByText('could not be checked')).toHaveCount(0);

  // The article's own words and the chosen level and count reach the prompt; the mock answers
  // with the catalogue's 15 items whatever count was asked for (the form's default is 8).
  expect(ai.prompts.exercises).toHaveLength(1);
  expect(ai.prompts.exercises[0]).toContain('Tu seras pour moi unique au monde');
  expect(ai.prompts.exercises[0]).toContain('CEFR level B1');
  expect(ai.prompts.exercises[0]).toContain('Write 8 exercise items');

  const { units } = await stored(page);
  expect(units).toHaveLength(11);
  for (const unit of units) {
    expect(unit.materialId).toBe('petit-prince');
    expect(catalogueIds).not.toContain(unit.id);
    expect(unit.items.every((item: { answerSource?: string }) => item.answerSource === 'ai')).toBe(true);
    expect(JSON.stringify(unit)).not.toContain('articleQuote');
  }
  expect(units.map((unit: { unitNumber: number }) => unit.unitNumber).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 11 }, (_, index) => index + 1),
  );

  // Progress is counted from stored states: nothing is checked yet.
  const first = main(page).getByRole('link', { name: /Le féminin des adjectifs/ });
  await expect(first).toContainText('Transform the word');
  await expect(first).toContainText('1 item');
  await expect(first).toContainText('Not started');

  // A second set continues the numbering instead of colliding with the first.
  await make(page).click();
  await expect(main(page).getByRole('link', { name: /Le féminin des adjectifs/ })).toHaveCount(2);
  expect(
    (await stored(page)).units.map((unit: { unitNumber: number }) => unit.unitNumber).sort((a, b) => a - b),
  ).toEqual(Array.from({ length: 22 }, (_, index) => index + 1));
});

test('the button shows the work and keeps its size', async ({ page, ai }) => {
  ai.answer({
    exercises: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return CATALOG_EXERCISES;
    },
  });
  await page.goto(PRACTICE);
  await waitForArticle(page);
  const button = make(page);
  const before = await button.boundingBox();
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Making exercises from the article…')).toBeVisible();
  expect(await button.boundingBox()).toEqual(before);
  await expect(main(page).getByRole('link', { name: /Le féminin des adjectifs/ })).toBeVisible();
  await expect(button).toBeEnabled();
  expect(await button.boundingBox()).toEqual(before);
});

test('items whose quote is not in the article are left out and counted; the rest is kept', async ({ page, ai }) => {
  const units = CATALOG_EXERCISES.units.map((unit) => {
    if (unit.id === 'unit-fill-blanks')
      return {
        ...unit,
        items: unit.items.map((item) =>
          item.id === 'fb-1' ? { ...item, articleQuote: 'Je ne mange pas de chapeau' } : item,
        ),
      };
    if (unit.id === 'unit-open-qa')
      return { ...unit, items: unit.items.map((item) => ({ ...item, articleQuote: 'Le renard parle du chapeau' })) };
    return unit;
  });
  ai.answer({ exercises: { units } });
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await make(page).click();

  await expect(page.getByText('2 items could not be checked against the article and were left out.')).toBeVisible();
  await expect(page.getByText('Made 13 items.')).toBeVisible();
  // The unit left with no items is gone; the one that lost an item shows what stayed.
  await expect(main(page).getByRole('link', { name: /Questions sur le texte/ })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: /Conjuguer au présent/ })).toContainText('1 item');
  const { units: saved } = await stored(page);
  expect(saved).toHaveLength(10);
  const kept = saved.find((unit: { title: string }) => unit.title === 'Conjuguer au présent et au futur');
  expect(kept?.items.map((item: { itemNumber: number | string }) => item.itemNumber)).toEqual([1]);
});

test('when no item can be checked against the article it fails and saves nothing', async ({ page, ai }) => {
  const fillUnit = CATALOG_EXERCISES.units.find((unit) => unit.id === 'unit-fill-blanks')!;
  ai.answer({
    exercises: {
      units: [{ ...fillUnit, items: fillUnit.items.map((item) => ({ ...item, articleQuote: 'Un chapeau' })) }],
    },
  });
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await make(page).click();
  await expect(page.getByRole('alert')).toContainText('The AI answer could not be used');
  await expect(page.getByRole('alert')).toContainText('quotes words that are not in the article');
  expect((await stored(page)).units).toEqual([]);
  await expect(make(page)).toBeEnabled();
});

test('a failed request shows the real reason on the page', async ({ page, ai }) => {
  ai.fail(['exercises']);
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await make(page).click();
  await expect(page.getByRole('alert')).toContainText('exercises failed');
  expect((await stored(page)).units).toEqual([]);
});

test('without a key it opens Settings → Text AI', async ({ page }) => {
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await page.evaluate(() => localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {} })));
  await page.reload();
  await waitForArticle(page);
  await make(page).click();
  await expect(page).toHaveURL(/#\/settings\/text-ai$/);
  await expect(page.getByPlaceholder('Paste your key here')).toBeFocused();
});

test('the reader has an entry that goes to the practice page for that article', async ({ page }) => {
  await openArticle(page);
  await page.getByRole('link', { name: 'Make exercises' }).click();
  await expect(page).toHaveURL(/#\/practice\?article=petit-prince$/);
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
  await expect(page.getByLabel('Article')).toHaveValue('petit-prince');
});

test('#/practice names the article read last, and the picker changes it', async ({ page }) => {
  await page.goto('/#/practice');
  await expect(page).toHaveURL(/#\/practice\?article=/);
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
  const options = await page.getByLabel('Article').locator('option').count();
  expect(options).toBeGreaterThan(1);
  await page.getByLabel('Article').selectOption({ index: 1 });
  const chosen = await page.getByLabel('Article').inputValue();
  await expect(page).toHaveURL(new RegExp(`article=${chosen}$`));
  // Practice from the sidebar returns to the article chosen last.
  await page.locator('[data-sidebar]').getByRole('link', { name: 'Read', exact: true }).click();
  await page.locator('[data-sidebar]').getByRole('link', { name: 'Practice', exact: true }).click();
  await expect(page.getByLabel('Article')).toHaveValue(chosen);
});

test('an article that is not in the library is a not-found page', async ({ page }) => {
  await page.goto('/#/practice?article=nope');
  await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
});

test('a unit that does not exist is a not-found page that leads back to Practice', async ({ page }) => {
  await page.goto('/#/practice/nope');
  await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
  await expect(page.getByText('That exercise is not here.')).toBeVisible();
  await page.getByRole('link', { name: 'Go to Practice' }).click();
  await expect(page).toHaveURL(/#\/practice\?article=/);
});

test('the sidebar lists the units of the open article and marks the open one', async ({ page }) => {
  await seedUnits(page);
  await page.goto(PRACTICE);
  const nav = page.locator('[data-sidebar]');
  await expect(nav.getByRole('link', { name: 'Practice', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const title of [
    'Le féminin des adjectifs',
    'Conjuguer au présent et au futur',
    'Le genre des noms',
    'Le vocabulaire du texte',
    'Associer la question et la réponse',
    'Remettre le dialogue dans l’ordre',
    'Les pronoms personnels',
    'Reformuler une idée',
    'Compléter le passage',
    'Les nombres',
    'Questions sur le texte',
  ])
    await expect(nav.getByRole('link', { name: title })).toBeVisible();

  await nav.getByRole('link', { name: 'Le genre des noms' }).click();
  await expect(page).toHaveURL(/#\/practice\/unit-gender-check$/);
  await expect(page.getByRole('heading', { name: 'Le genre des noms' })).toBeVisible();
  await expect(nav).toHaveAttribute('data-sidebar', 'rail');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(nav).toHaveAttribute('data-sidebar', 'expanded');
  expect(await page.evaluate(() => localStorage.getItem('relire_sidebar'))).toBeNull();
  await expect(nav.getByRole('link', { name: 'Le genre des noms' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Le féminin des adjectifs' })).toBeVisible();

  // Progress shows on the list from stored states.
  await page.getByRole('link', { name: 'Practice', exact: true }).first().click();
  await expect(page).toHaveURL(/#\/practice\?article=petit-prince$/);
});

test('progress on the list comes from the checked items', async ({ page }) => {
  await seedUnits(page);
  await openUnit(page, 'unit-word-transform', 'Le féminin des adjectifs');
  const item = page.getByRole('listitem').filter({ hasText: 'intrigué' });
  await item.getByRole('textbox').fill('intriguée');
  await item.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(item.getByText('Correct')).toBeAttached();
  await page.goto(PRACTICE);
  await expect(main(page).getByRole('link', { name: /Le féminin des adjectifs/ })).toContainText(
    '1 of 1 checked, 1 right',
  );
  await expect(main(page).getByRole('link', { name: /Conjuguer au présent/ })).toContainText('Not started');
});

test('the open oral assessment stays on the practice page as its own section', async ({ page }) => {
  await page.goto(PRACTICE);
  await expect(page.getByRole('heading', { name: 'Read aloud' })).toBeVisible();
  await expect(page.getByText(/^Sentence 1 of \d+$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next sentence' }).click();
  await expect(page.getByText(/^Sentence 2 of \d+$/)).toBeVisible();
});

test('a deep-linked unit keeps its article in the sidebar Practice link', async ({ page }) => {
  await seedUnits(page);
  const materialId = await page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const d = await db();
    const article = (await d.getAll('articles')).find((a) => a.id !== 'petit-prince')!;
    const unit = (await d.get('units', 'unit-open-qa'))!;
    await d.put('units', { ...unit, materialId: article.id });
    return article.id as string;
  });
  await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Questions sur le texte' })).toBeVisible();
  const link = page.locator('[data-sidebar]').getByRole('link', { name: 'Practice', exact: true });
  await expect(link).toHaveAttribute('href', `#/practice?article=${materialId}`);
  await link.click();
  await expect(page.getByLabel('Article')).toHaveValue(materialId);
});

test('generation refuses to attach exercises when the source article changed', async ({ page, ai }) => {
  const pending = Promise.withResolvers<typeof CATALOG_EXERCISES>();
  ai.answer({ exercises: () => pending.promise });
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await make(page).click();
  await expect.poll(() => ai.calls.exercises).toBe(1);
  // Another editor committed new content while the request still used the old article.
  await page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const d = await db();
    const article = (await d.get('articles', 'petit-prince'))!;
    await d.put('articles', { ...article, content: 'Un autre texte.' });
  });
  pending.resolve(CATALOG_EXERCISES);
  await expect(page.getByRole('alert')).toHaveText(
    'The article changed while exercises were being made. Make a new set from the updated text.',
  );
  expect((await stored(page)).units).toEqual([]);
  await expect(make(page)).toBeEnabled();
});
