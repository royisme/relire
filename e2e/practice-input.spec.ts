/**
 * Keyboard and French characters on the unit sheet: Enter moves to the next blank and checks on the
 * last, a composition never submits, the character bar types at the cursor without taking focus or
 * moving the page.
 */
import { expect, layout, test } from './fixtures';
import { checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';

test.beforeEach(async ({ page, ai }) => {
  void ai; // onboards the app with a test key and answers every AI request from fixtures
  await seedUnits(page);
});

test.describe('Enter', () => {
  test('moves to the next blank, then to an empty one, then checks', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const two = row(page, "Si tu m'");
    const [first, second] = [two.getByRole('textbox').nth(0), two.getByRole('textbox').nth(1)];

    await first.fill('apprivoises');
    await first.press('Enter');
    await expect(second).toBeFocused();

    // On the last blank with an earlier one still empty, Enter goes back to the empty one.
    await second.press('Enter');
    await expect(second).toBeFocused();
    await second.fill('aurons');
    await first.fill('');
    await second.press('Enter');
    await expect(first).toBeFocused();
    expect((await stored(page)).attempts).toHaveLength(0);

    await first.fill('apprivoises');
    await second.press('Enter');
    await expect(two.getByText('Correct', { exact: true })).toBeAttached();
    expect((await stored(page)).attempts).toHaveLength(1);
  });

  test('a single blank is checked by Enter', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const item = row(page, 'Je ne');
    await item.getByRole('textbox').fill('mange');
    await item.getByRole('textbox').press('Enter');
    await expect(item.getByText('Correct', { exact: true })).toBeAttached();
  });

  test('Enter during an IME composition only commits the text', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const item = row(page, 'Je ne');
    const field = item.getByRole('textbox');
    await field.fill('mange');
    await field.focus();
    // A composing Enter: the standard flag, and the legacy key code some browsers send instead.
    await field.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    await field.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 });
    await expect(item.getByText('Correct', { exact: true })).toHaveCount(0);
    await expect(field).toBeFocused();
    expect((await stored(page)).attempts).toHaveLength(0);

    await field.press('Enter');
    await expect(item.getByText('Correct', { exact: true })).toBeAttached();
  });

  test('in an open answer, Enter checks and Shift+Enter starts a new line', async ({ page }) => {
    await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
    const area = page.getByRole('textbox');
    await area.fill("On ne voit bien qu'avec le cœur.");
    await area.press('Shift+Enter');
    await expect(area).toHaveValue("On ne voit bien qu'avec le cœur.\n");
    await area.press('Backspace');
    await area.press('Enter');
    await expect(row(page, 'Quel est le secret').getByText('Correct', { exact: true })).toBeAttached();
  });
});

test.describe('French characters', () => {
  const toggle = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'French characters' });
  const grid = (page: import('@playwright/test').Page) => page.getByRole('group', { name: 'French characters' });

  test('inserts at the cursor, keeps focus in the input and opens only by its toggle', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const field = row(page, 'Je ne').getByRole('textbox');
    await expect(grid(page)).toHaveCount(0);

    await field.fill('ab');
    await field.press('ArrowLeft');
    // Focusing a field does not open the bar; the toggle does.
    await expect(grid(page)).toHaveCount(0);
    await toggle(page).click();
    await expect(grid(page)).toBeVisible();
    await expect(field).toBeFocused();

    await grid(page).getByRole('button', { name: 'é', exact: true }).click();
    await expect(field).toHaveValue('aéb');
    await expect(field).toBeFocused();
    // The cursor sits after the new letter, so typing continues there.
    await page.keyboard.type('x');
    await expect(field).toHaveValue('aéxb');

    // Every character in the set is there.
    for (const character of 'éèêëàâçîïôùûüœæ«»')
      await expect(grid(page).getByRole('button', { name: character, exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(grid(page)).toHaveCount(0);
    await expect(field).toBeFocused();
  });

  test('capitals come from Shift, once', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const field = row(page, 'Je ne').getByRole('textbox');
    await field.click();
    await toggle(page).click();
    await grid(page).getByRole('button', { name: 'Shift' }).click();
    await expect(grid(page).getByRole('button', { name: 'É', exact: true })).toBeVisible();
    await grid(page).getByRole('button', { name: 'É', exact: true }).click();
    await expect(field).toHaveValue('É');
    // Shift is used up after one letter.
    await grid(page).getByRole('button', { name: 'è', exact: true }).click();
    await expect(field).toHaveValue('Éè');
    await expect(field).toBeFocused();
  });

  test('follows the field the cursor is in, and the answer it writes is saved', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const [a, b] = [row(page, 'Je ne').getByRole('textbox'), row(page, "Si tu m'").getByRole('textbox').nth(0)];
    await toggle(page).click();
    await expect(grid(page).getByText('Click in an answer first.')).toBeVisible();
    await a.click();
    await grid(page).getByRole('button', { name: 'ç', exact: true }).click();
    await b.click();
    await grid(page).getByRole('button', { name: 'â', exact: true }).click();
    await expect(a).toHaveValue('ç');
    await expect(b).toHaveValue('â');
    await expect
      .poll(async () =>
        (await stored(page)).itemStates
          .map((s: { answer: { singleAnswer: string; multiAnswers: string[] } }) =>
            (s.answer.singleAnswer || s.answer.multiAnswers.join('')).trim(),
          )
          .sort(),
      )
      .toEqual(['â', 'ç']);
  });

  test('does not type into a checked answer', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const item = row(page, 'Je ne');
    await item.getByRole('textbox').fill('mange');
    await checkButton(item).click();
    await item.getByRole('textbox').focus();
    await toggle(page).click();
    await expect(grid(page).getByRole('button', { name: 'é', exact: true })).toBeDisabled();
    await expect(item.getByRole('textbox')).toHaveValue('mange');
  });

  test('opening it and inserting do not move the page', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const field = row(page, "Si tu m'").getByRole('textbox').nth(0);
    await field.scrollIntoViewIfNeeded();
    await field.click();
    const scrollBefore = await page.evaluate(() => scrollY);
    const before = await layout(page, 'main');
    const box = await field.boundingBox();
    await toggle(page).click();
    await grid(page).getByRole('button', { name: 'é', exact: true }).click();
    await grid(page).getByRole('button', { name: 'ü', exact: true }).click();
    expect(await layout(page, 'main')).toEqual(before);
    expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
    expect(await field.boundingBox()).toEqual(box);
  });
});
