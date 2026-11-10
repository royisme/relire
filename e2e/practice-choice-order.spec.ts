/**
 * The choice and order controls: GENDER_CHECK, ODD_ONE_OUT, MATCH_PAIRS and
 * DIALOGUE_ORDER answered right and wrong from the catalogue fixtures, at
 * 1280px and 360px, and with the keyboard alone.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, overflowing, test } from './fixtures';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import { checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';

const choiceUnits = CATALOG_EXERCISES.units.filter((unit) =>
  ['unit-gender-check', 'unit-odd-one-out', 'unit-match-pairs', 'unit-dialogue-order'].includes(unit.id),
);

const struck = (field: Locator) => expect(field).toHaveCSS('text-decoration-line', 'line-through');
const notStruck = (field: Locator) => expect(field).toHaveCSS('text-decoration-line', 'none');

/** Wrong answers leave the reference beside them; the sheet must not overflow. */
const fits = (page: Page) => overflowing(page.locator('body')).then((out) => expect(out).toEqual([]));

test.beforeEach(async ({ page, ai }) => {
  void ai; // onboards the app with a test key and answers every AI request from fixtures
  await seedUnits(page, choiceUnits);
});

async function genderCheck(page: Page) {
  await openUnit(page, 'unit-gender-check', 'Le genre des noms');
  const one = row(page, 'ta rose');
  await expect(checkButton(one)).toBeDisabled();
  await one.getByRole('radio', { name: 'Feminine' }).click();
  await expect(one.getByRole('radio', { name: 'Feminine' })).toHaveAttribute('aria-checked', 'true');
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();
  await expect(one.getByRole('radio', { name: 'Feminine' })).toHaveCSS('background-color', 'rgb(238, 246, 240)');

  const two = row(page, 'fleur');
  await two.getByRole('radio', { name: 'Masculine' }).click();
  await checkButton(two).click();
  await expect(two.getByText('Incorrect', { exact: true })).toBeAttached();
  await struck(two.getByRole('radio', { name: 'Masculine' }));
  await expect(two.getByRole('radio', { name: 'Feminine' })).toHaveAttribute('aria-checked', 'false');
  await expect(two.getByText('Feminine', { exact: true })).toBeVisible();
  await fits(page);
  const { attempts } = await stored(page);
  expect(attempts.find((a: { itemId: string }) => a.itemId === 'gc-2')).toMatchObject({
    userAnswer: 'M',
    expectedAnswer: 'F',
    correct: false,
  });
}

async function oddOneOut(page: Page) {
  await openUnit(page, 'unit-odd-one-out', 'Le vocabulaire du texte');
  const one = row(page, 'Quel mot');
  await expect(checkButton(one)).toBeDisabled();
  await one.getByRole('radio', { name: 'blé' }).click();
  await checkButton(one).click();
  await expect(one.getByText('Incorrect', { exact: true })).toBeAttached();
  await struck(one.getByRole('radio', { name: 'blé' }));
  await expect(one.getByText('Correct answer:')).toBeAttached();
  await expect(one.getByText('renard', { exact: true }).last()).toBeVisible();
  await fits(page);

  // A reset clears the sheet and keeps the history, so the item can be answered right.
  await page.getByRole('button', { name: 'Reset this unit' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await one.getByRole('radio', { name: 'renard' }).click();
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();
  await notStruck(one.getByRole('radio', { name: 'renard' }));
  const { attempts } = await stored(page);
  expect(attempts.map((a: { correct: boolean }) => a.correct).sort((a, b) => Number(a) - Number(b))).toEqual([
    false,
    true,
  ]);
}

async function matchPairs(page: Page) {
  await openUnit(page, 'unit-match-pairs', 'Associer la question et la réponse');
  const one = row(page, 'Que dit le renard');
  await expect(checkButton(one)).toBeDisabled();
  await one.getByRole('radio', { name: /Elle est pleine de voyages/ }).click();
  await checkButton(one).click();
  await expect(one.getByText('Incorrect', { exact: true })).toBeAttached();
  await struck(one.getByRole('radio', { name: /Elle est pleine de voyages/ }));
  await expect(one.getByText('Correct answer:')).toBeAttached();
  await expect(one.getByText('b – Ma vie est monotone.').last()).toBeVisible();
  await fits(page);
  const { attempts } = await stored(page);
  expect(attempts.find((a: { itemId: string }) => a.itemId === 'mp-1')).toMatchObject({
    userAnswer: 'c',
    expectedAnswer: 'b',
    correct: false,
  });

  await page.getByRole('button', { name: 'Reset this unit' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await one.getByRole('radio', { name: /Ma vie est monotone/ }).click();
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();
}

async function dialogueOrder(page: Page, phone: boolean) {
  await openUnit(page, 'unit-dialogue-order', 'Remettre le dialogue dans l’ordre');
  const one = row(page, 'Le dialogue entre le renard');
  // The printed order already counts as an answer, so the item can be checked as it stands.
  await expect(checkButton(one)).toBeEnabled();
  if (phone) {
    const box = await one.getByRole('button', { name: 'Move a up' }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(40);
  }
  await checkButton(one).click();
  await expect(one.getByText('Incorrect', { exact: true })).toBeAttached();
  // Lines in their right place stay plain; misplaced ones are struck through.
  await struck(one.getByText('a – Il y a des chasseurs').first());
  await notStruck(one.getByText('b – Oui.').first());
  await notStruck(one.getByText('d – Non.').first());
  await expect(one.getByText('Correct answer:')).toBeAttached();
  await expect(one.getByText('c – Sur une autre planète ?').last()).toBeVisible();
  await fits(page);
  const { attempts } = await stored(page);
  expect(attempts.find((a: { itemId: string }) => a.itemId === 'do-1')).toMatchObject({
    expectedAnswer: 'c / b / a / d',
    correct: false,
  });

  await page.getByRole('button', { name: 'Reset this unit' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await one.getByRole('button', { name: 'Move a down' }).click();
  await one.getByRole('button', { name: 'Move a down' }).click();
  await one.getByRole('button', { name: 'Move c up' }).click();
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();
  await notStruck(one.getByText('a – Il y a des chasseurs').first());
}

for (const phone of [false, true]) {
  const suffix = phone ? ' @phone' : '';

  test(`gender check: a right and a wrong pick${suffix}`, async ({ page }) => {
    await genderCheck(page);
    if (phone) {
      const box = await row(page, 'fleur').getByRole('radio', { name: 'Masculine' }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(40);
    }
  });

  test(`odd one out: a wrong pick is struck through, then the right one after a reset${suffix}`, async ({ page }) => {
    await oddOneOut(page);
  });

  test(`match the pairs: a wrong pick is struck through, then the right one after a reset${suffix}`, async ({
    page,
  }) => {
    await matchPairs(page);
  });

  test(`order the dialogue: the printed order is wrong, the arranged one is right${suffix}`, async ({ page }) => {
    await dialogueOrder(page, phone);
  });
}

test('arrow keys pick a gender and move a line of the dialogue', async ({ page }) => {
  await openUnit(page, 'unit-gender-check', 'Le genre des noms');
  const one = row(page, 'ta rose');
  await one.getByRole('radio', { name: 'Masculine' }).focus();
  await page.keyboard.press('ArrowRight');
  const feminine = one.getByRole('radio', { name: 'Feminine' });
  await expect(feminine).toBeFocused();
  await expect(feminine).toHaveAttribute('aria-checked', 'true');
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();

  await openUnit(page, 'unit-dialogue-order', 'Remettre le dialogue dans l’ordre');
  const two = row(page, 'Le dialogue entre le renard');
  const lines = two.getByRole('list', { name: 'Item 1, lines' }).getByRole('listitem');
  const up = two.getByRole('button', { name: 'Move c up' });
  await up.focus();
  await page.keyboard.press('ArrowUp');
  await expect(lines.nth(0)).toContainText('a –');
  await expect(lines.nth(1)).toContainText('c –');
  await expect(up).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(lines.nth(0)).toContainText('c –');
});
