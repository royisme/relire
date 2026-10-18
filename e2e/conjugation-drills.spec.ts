/**
 * Conjugation drills from the Practice dialog: pack verbs only, so a set is
 * made with no AI key configured and no AI request at all, and every item is
 * graded with accents whatever the global strict-accents preference says.
 */
import { expect, test, type MockAi } from './fixtures';
import { PRACTICE, row, stored, waitForArticle } from './practice.helpers';
import type { Page } from '@playwright/test';

const setLinks = (page: Page) => page.locator('main tbody a[href^="#/practice/set/"]');

type StoredUnit = { id: string; setId: string; title: string; type: string; items: unknown[] };

/** No key and strict accents off: the strictest honest starting point for these drills. */
async function withoutKey(page: Page) {
  await page.goto(PRACTICE);
  await waitForArticle(page);
  await page.evaluate(() =>
    localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {}, practiceStrictAccents: false })),
  );
  await page.reload();
  await waitForArticle(page);
}

/** Makes one drill set (aller, passé composé) through the dialog and returns its stored units. */
async function makeDrillSet(page: Page): Promise<StoredUnit[]> {
  await page.getByRole('button', { name: 'Add exercises', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add exercises' });
  await dialog.getByRole('button', { name: 'Conjugation drills', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'aller', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Passé composé', exact: true }).check();
  await dialog.getByRole('button', { name: 'Make exercises', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(setLinks(page)).toHaveCount(1);
  const { units } = await stored(page);
  return units as unknown as StoredUnit[];
}

const aiCalls = (ai: MockAi) => Object.values(ai.calls).reduce((sum, calls) => sum + calls, 0);

test('a set is made from the pack with no key and no AI request', async ({ page, ai }) => {
  await withoutKey(page);
  const units = await makeDrillSet(page);
  expect(aiCalls(ai)).toBe(0);
  expect(units).toHaveLength(1);
  const [unit] = units;
  expect(unit.type).toBe('WORD_TRANSFORM');
  expect(unit.title).toBe('Conjugation: Passé composé');
  // One verb, so the per-verb cap of 2 decides the size, whatever the shuffle picked.
  expect(unit.items).toHaveLength(2);
  for (const item of unit.items as { expectedAnswer: string; grammarTag: string; meta?: Record<string, unknown> }[]) {
    expect(item.grammarTag).toBe('passe-compose');
    expect(item.meta?.source).toBe('grammar-pack');
    expect(typeof item.meta?.packVersion).toBe('string');
    expect(item.meta?.strictAccents).toBe(true);
    expect(item.expectedAnswer).toMatch(/allé/);
  }
});

test('a correct answer passes; an accent-less answer is wrong with the preference off', async ({ page, ai }) => {
  await withoutKey(page);
  const [unit] = await makeDrillSet(page);
  expect(aiCalls(ai)).toBe(0);
  await page.locator(`main a[href="#/practice/set/${unit.setId}"]`).click();
  await page.locator(`main a[href="#/practice/${unit.id}"]`).click();
  const items = unit.items as {
    prompt: string;
    expectedAnswer: string;
  }[];
  await expect(page.getByRole('heading', { name: unit.title })).toBeVisible();

  const first = row(page, items[0]!.prompt);
  await first.getByRole('textbox').fill(items[0]!.expectedAnswer);
  await first.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(first.getByText('Correct', { exact: true })).toBeVisible();

  const second = row(page, items[1]!.prompt);
  await second.getByRole('textbox').fill(items[1]!.expectedAnswer.replaceAll('é', 'e'));
  await second.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(second.getByText('Incorrect', { exact: true })).toBeVisible();
  await expect(second.getByText(items[1]!.expectedAnswer, { exact: true })).toBeVisible();

  expect(aiCalls(ai)).toBe(0);
  const { itemStates } = await stored(page);
  expect(itemStates).toHaveLength(2);
  for (const state of itemStates as { checked: { correct: boolean; strictAccents: boolean } }[])
    // The stored flag equals the one the grader used: the item required accents.
    expect(state.checked.strictAccents).toBe(true);
  expect(
    (itemStates as { checked: { correct: boolean } }[])
      .map((state) => state.checked.correct)
      .sort((a, b) => Number(a) - Number(b)),
  ).toEqual([false, true]);
});
