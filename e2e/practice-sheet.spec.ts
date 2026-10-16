/**
 * The unit sheet: FILL_BLANKS, CHOICE_SELECT and WORD_TRANSFORM answered right and wrong, what a
 * wrong answer looks like, batch checking, and a type whose control is not built yet.
 */
import { expect, test } from './fixtures';
import { checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';

const struck = (field: import('@playwright/test').Locator) =>
  expect(field).toHaveCSS('text-decoration-line', 'line-through');
const notStruck = (field: import('@playwright/test').Locator) =>
  expect(field).toHaveCSS('text-decoration-line', 'none');

test.beforeEach(async ({ page, ai }) => {
  void ai; // onboards the app with a test key and answers every AI request from fixtures
  await seedUnits(page);
});

test.describe('fill in the blanks', () => {
  test('a right answer is marked, a wrong one is struck through with the answer beside it', async ({ page }) => {
    await openUnit(page, 'u1', 'Les mots du renard');
    await expect(page.getByRole('heading', { name: 'Les mots du renard' })).toBeVisible();
    await expect(page.getByText('Type the missing word in each blank.')).toBeVisible();

    const right = row(page, 'Je ne');
    await right.getByRole('textbox').fill('suis');
    await checkButton(right).click();
    await expect(right.getByText('Correct', { exact: true })).toBeAttached();
    await expect(right.getByRole('textbox')).toHaveCSS('border-bottom-color', 'rgb(38, 99, 61)');
    await notStruck(right.getByRole('textbox'));
    await expect(right.getByRole('button', { name: 'Checked' })).toBeDisabled();
    await expect(right.getByText('Être with je: je suis.')).toBeVisible();

    const wrong = row(page, 'On ne');
    await wrong.getByRole('textbox').fill('voie');
    await checkButton(wrong).click();
    await expect(wrong.getByText('Incorrect', { exact: true })).toBeAttached();
    await struck(wrong.getByRole('textbox'));
    await expect(wrong.getByRole('textbox')).toHaveValue('voie');
    await expect(wrong.getByText('Correct answer:')).toBeAttached();
    await expect(wrong.getByText('voit', { exact: true })).toBeVisible();

    const { attempts, itemStates } = await stored(page);
    expect(itemStates).toHaveLength(2);
    expect(attempts.map((a: { correct: boolean }) => a.correct).sort()).toEqual([false, true]);
    expect(attempts.find((a: { itemId: string }) => a.itemId === 'fb3')).toMatchObject({
      userAnswer: 'voie',
      expectedAnswer: 'voit',
      grammarTag: 'present',
      materialId: 'petit-prince',
    });
  });

  test('accents do not decide a match, and only the wrong blank of several is struck through', async ({ page }) => {
    await openUnit(page, 'u1', 'Les mots du renard');
    const two = row(page, 'invisible');
    const [first, second] = [two.getByRole('textbox').nth(0), two.getByRole('textbox').nth(1)];
    await first.fill('EST');
    await second.fill('par');
    await checkButton(two).click();
    await expect(two.getByText('Incorrect', { exact: true })).toBeAttached();
    await notStruck(first);
    await struck(second);
    await expect(two.getByText('pour', { exact: true })).toBeVisible();
    // The right blank has no reference answer beside it.
    await expect(two.getByText('est', { exact: true })).toHaveCount(0);
  });

  test('a checked row cannot be edited, and the check cannot be repeated', async ({ page }) => {
    await openUnit(page, 'u1', 'Les mots du renard');
    const item = row(page, 'Je ne');
    const field = item.getByRole('textbox');
    await field.fill('suis');
    await checkButton(item).click();
    await expect(item.getByText('Correct', { exact: true })).toBeAttached();
    await field.press('x');
    await expect(field).toHaveValue('suis');
    await field.press('Enter');
    expect((await stored(page)).attempts).toHaveLength(1);
  });

  test('Check is off until something is typed, and "Check all" checks only what is filled in', async ({ page }) => {
    await openUnit(page, 'u1', 'Les mots du renard');
    await expect(checkButton(row(page, 'Je ne'))).toBeDisabled();
    const all = page.getByRole('button', { name: 'Check all' });
    await expect(all).toBeDisabled();
    await expect(page.getByText('0 of 3 checked, 0 right')).toBeVisible();

    await row(page, 'Je ne').getByRole('textbox').fill('suis');
    await row(page, 'On ne').getByRole('textbox').fill('voie');
    await expect(all).toBeEnabled();
    await all.click();
    await expect(page.getByText('2 of 3 checked, 1 right')).toBeVisible();
    await expect(all).toBeDisabled();
    // The empty row was not counted as a mistake.
    expect((await stored(page)).attempts).toHaveLength(2);
    await expect(checkButton(row(page, 'invisible'))).toBeDisabled();
  });
});

test.describe('choose the option', () => {
  test('right and wrong picks, per group', async ({ page }) => {
    await openUnit(page, 'u2', 'Choisir la bonne forme');
    const one = row(page, 'Le petit prince');
    await one.getByRole('button', { name: 'commença', exact: true }).click();
    await expect(one.getByRole('button', { name: 'commença', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await checkButton(one).click();
    await expect(one.getByText('Correct', { exact: true })).toBeAttached();

    const two = row(page, 'apprivoises');
    await two.getByRole('button', { name: 'aurons', exact: true }).click();
    await two.getByRole('button', { name: "l'une", exact: true }).click();
    await checkButton(two).click();
    await expect(two.getByText('Incorrect', { exact: true })).toBeAttached();
    await struck(two.getByRole('button', { name: "l'une", exact: true }));
    await notStruck(two.getByRole('button', { name: 'aurons', exact: true }));
    await expect(two.getByText("l'un", { exact: true }).last()).toBeVisible();
    // The pick stays visible and cannot be changed after the check.
    await two.getByRole('button', { name: "l'un", exact: true }).first().click({ force: true });
    await expect(two.getByRole('button', { name: "l'une", exact: true })).toHaveAttribute('aria-pressed', 'true');
    const { attempts } = await stored(page);
    expect(attempts.find((a: { itemId: string }) => a.itemId === 'cs2')).toMatchObject({
      userAnswer: "aurons / l'une",
      expectedAnswer: "aurons / l'un",
      correct: false,
    });
  });

  test('one pick is enough to check; the groups left open count as wrong', async ({ page }) => {
    await openUnit(page, 'u2', 'Choisir la bonne forme');
    const two = row(page, 'apprivoises');
    await two.getByRole('button', { name: 'aurons', exact: true }).click();
    await checkButton(two).click();
    await expect(two.getByText('Incorrect', { exact: true })).toBeAttached();
  });
});

test.describe('transform the word', () => {
  test('a right and a wrong word', async ({ page }) => {
    await openUnit(page, 'u3', 'Accorder le mot');
    const one = row(page, 'ensoleillée');
    await expect(one.getByText('masculin', { exact: true })).toBeVisible();
    await one.getByRole('textbox').fill('ensoleille');
    await checkButton(one).click();
    // Accents are spelling help for now, so the unaccented form is accepted.
    await expect(one.getByText('Correct', { exact: true })).toBeAttached();

    const two = row(page, 'doré');
    await two.getByRole('textbox').fill('dorés');
    await checkButton(two).click();
    await expect(two.getByText('Incorrect', { exact: true })).toBeAttached();
    await struck(two.getByRole('textbox'));
    await expect(two.getByText('dorée', { exact: true })).toBeVisible();
  });
});

test('a type whose control is not built yet is shown but cannot be answered', async ({ page }) => {
  await page.evaluate(async () => {
    const storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    await storage.saveUnits('petit-prince', [
      {
        id: 'soon',
        section: 'COMPRENDRE',
        unitNumber: 9,
        title: 'Bientôt',
        instruction: 'Order the lines.',
        type: 'GENDER_CHECK',
        grammarTags: ['gender-number'],
        items: [
          {
            id: 'g1',
            itemNumber: 1,
            prompt: 'le renard',
            expectedAnswer: 'M',
            options: ['M', 'F'],
            grammarTag: 'gender-number',
          },
        ],
      },
    ]);
  });
  await openUnit(page, 'soon', 'Bientôt');
  const item = row(page, 'le renard');
  await expect(item.getByText('Gender check exercises are coming. This item cannot be answered yet.')).toBeVisible();
  await expect(item.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check all' })).toBeDisabled();
});
