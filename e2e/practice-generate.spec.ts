/**
 * Practice page: making exercises from an article (the AI is mocked), the units it lists with real
 * progress, the reader's entry point, the sidebar list, a missing unit and a missing key.
 */
import { expect, openArticle, test } from './fixtures';
import { sampleExercises } from './practiceFixtures';
import { PRACTICE, openUnit, seedUnits, stored, waitForArticle } from './practice.helpers';

// `ai` onboards the app with a test key and answers every AI request from fixtures.
test.beforeEach(async ({ ai }) => {
  ai.ttsDelayMs = 50;
});

const main = (page: import('@playwright/test').Page) => page.getByRole('main');
const make = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Make exercises from this article' });

test('makes exercises from the article, saves them with fresh ids and lists them', async ({ page, ai }) => {
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
  await expect(page.getByText('No exercises from this article yet.')).toBeVisible();

  await make(page).click();
  await expect(main(page).getByRole('link', { name: /Les mots du renard/ })).toBeVisible();
  await expect(page.getByText('Made 8 items. They are in the list below.')).toBeVisible();
  await expect(page.getByText('could not be checked')).toHaveCount(0);

  // The article's own words and the chosen level and count reach the prompt.
  expect(ai.prompts.exercises).toHaveLength(1);
  expect(ai.prompts.exercises[0]).toContain('Tu seras pour moi unique au monde');
  expect(ai.prompts.exercises[0]).toContain('CEFR level B1');
  expect(ai.prompts.exercises[0]).toContain('Write 8 exercise items');

  const { units } = await stored(page);
  expect(units).toHaveLength(4);
  for (const unit of units) {
    expect(unit.materialId).toBe('petit-prince');
    expect(['u1', 'u2', 'u3', 'u4']).not.toContain(unit.id);
    expect(unit.items.every((item: { answerSource?: string }) => item.answerSource === 'ai')).toBe(true);
    expect(JSON.stringify(unit)).not.toContain('articleQuote');
  }
  expect(units.map((unit: { unitNumber: number }) => unit.unitNumber).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);

  // Progress is counted from stored states: nothing is checked yet.
  const first = main(page).getByRole('link', { name: /Les mots du renard/ });
  await expect(first).toContainText('Fill in the blanks');
  await expect(first).toContainText('3 items');
  await expect(first).toContainText('Not started');

  // A second set continues the numbering instead of colliding with the first.
  await make(page).click();
  await expect(main(page).getByRole('link', { name: /Les mots du renard/ })).toHaveCount(2);
  expect(
    (await stored(page)).units.map((unit: { unitNumber: number }) => unit.unitNumber).sort((a, b) => a - b),
  ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

test('the button shows the work and keeps its size', async ({ page, ai }) => {
  ai.answer({
    exercises: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return sampleExercises;
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
  await expect(main(page).getByRole('link', { name: /Les mots du renard/ })).toBeVisible();
  await expect(button).toBeEnabled();
  expect(await button.boundingBox()).toEqual(before);
});

test('items whose quote is not in the article are left out and counted; the rest is kept', async ({ page, ai }) => {
  const [u1, u2, u3, u4] = sampleExercises.units;
  const first = { ...u1.items[0], articleQuote: 'Je ne suis pas un renard du tout' };
  const lost = { ...u4.items[0], articleQuote: 'Le renard parle du chapeau' };
  ai.answer({
    exercises: { units: [{ ...u1, items: [first, ...u1.items.slice(1)] }, u2, u3, { ...u4, items: [lost] }] },
  });
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await make(page).click();

  await expect(page.getByText('2 items could not be checked against the article and were left out.')).toBeVisible();
  await expect(page.getByText('Made 6 items.')).toBeVisible();
  // The unit left with no items is gone; the one that lost an item shows what stayed.
  await expect(main(page).getByRole('link', { name: /Questions ouvertes/ })).toHaveCount(0);
  await expect(main(page).getByRole('link', { name: /Les mots du renard/ })).toContainText('2 items');
  const { units } = await stored(page);
  expect(units).toHaveLength(3);
  const kept = units.find((unit: { title: string }) => unit.title === 'Les mots du renard');
  expect(kept?.items.map((item: { itemNumber: number | string }) => item.itemNumber)).toEqual([1, 2]);
});

test('when no item can be checked against the article it fails and saves nothing', async ({ page, ai }) => {
  const [u1] = sampleExercises.units;
  ai.answer({ exercises: { units: [{ ...u1, items: u1.items.map((i) => ({ ...i, articleQuote: 'Un chapeau' })) }] } });
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
  for (const title of ['Les mots du renard', 'Choisir la bonne forme', 'Accorder le mot', 'Questions ouvertes'])
    await expect(nav.getByRole('link', { name: title })).toBeVisible();

  await nav.getByRole('link', { name: 'Accorder le mot' }).click();
  await expect(page).toHaveURL(/#\/practice\/u3$/);
  await expect(page.getByRole('heading', { name: 'Accorder le mot' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Accorder le mot' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Les mots du renard' })).toBeVisible();

  // Progress shows on the list from stored states.
  await page.getByRole('link', { name: 'Practice', exact: true }).first().click();
  await expect(page).toHaveURL(/#\/practice\?article=petit-prince$/);
});

test('progress on the list comes from the checked items', async ({ page }) => {
  await seedUnits(page);
  await openUnit(page, 'u3', 'Accorder le mot');
  const item = page.getByRole('listitem').filter({ hasText: 'ensoleillée' });
  await item.getByRole('textbox').fill('ensoleillé');
  await item.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(item.getByText('Correct')).toBeAttached();
  await page.goto(PRACTICE);
  await expect(main(page).getByRole('link', { name: /Accorder le mot/ })).toContainText('1 of 2 checked, 1 right');
  await expect(main(page).getByRole('link', { name: /Les mots du renard/ })).toContainText('Not started');
});

test('the open oral assessment stays on the practice page as its own section', async ({ page }) => {
  await page.goto(PRACTICE);
  await expect(page.getByRole('heading', { name: 'Read aloud' })).toBeVisible();
  await expect(page.getByText(/^Sentence 1 of \d+$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next sentence' }).click();
  await expect(page.getByText(/^Sentence 2 of \d+$/)).toBeVisible();
});
