/**
 * The unit sheet: FILL_BLANKS, CHOICE_SELECT and WORD_TRANSFORM answered right and wrong from
 * the catalogue fixtures, what a wrong answer looks like, batch checking, the per-item Listen
 * control and redoing one item. The remaining types are covered by practice-choice-order.spec.ts
 * and practice-writing-listening.spec.ts.
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
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    await expect(page.getByRole('heading', { name: 'Conjuguer au présent et au futur' })).toBeVisible();
    await expect(page.getByText('Conjuguez le verbe entre parenthèses.')).toBeVisible();

    const right = row(page, 'Je ne');
    await right.getByRole('textbox').fill('mange');
    await checkButton(right).click();
    await expect(right.getByText('Correct', { exact: true })).toBeAttached();
    await expect(right.getByRole('textbox')).toHaveCSS('border-bottom-color', 'rgb(38, 99, 61)');
    await notStruck(right.getByRole('textbox'));
    await expect(right.getByRole('button', { name: 'Checked' })).toBeDisabled();

    const wrong = row(page, "Si tu m'");
    const [first, second] = [wrong.getByRole('textbox').nth(0), wrong.getByRole('textbox').nth(1)];
    await first.fill('apprivoise');
    await second.fill('auron');
    await checkButton(wrong).click();
    await expect(wrong.getByText('Incorrect', { exact: true })).toBeAttached();
    await struck(first);
    await struck(second);
    await expect(first).toHaveValue('apprivoise');
    await expect(second).toHaveValue('auron');
    await expect(wrong.getByText('Correct answer:').first()).toBeAttached();
    await expect(wrong.getByText('apprivoises', { exact: true })).toBeVisible();
    await expect(wrong.getByText('aurons', { exact: true })).toBeVisible();

    const { attempts, itemStates } = await stored(page);
    expect(itemStates).toHaveLength(2);
    expect(attempts.map((a: { correct: boolean }) => a.correct).sort((a, b) => Number(a) - Number(b))).toEqual([
      false,
      true,
    ]);
    expect(attempts.find((a: { itemId: string }) => a.itemId === 'fb-2')).toMatchObject({
      userAnswer: 'apprivoise / auron',
      expectedAnswer: 'apprivoises / aurons',
      grammarTag: 'hypothesis-si',
    });
  });

  test('accents do not decide a match, and only the wrong blank of several is struck through', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const two = row(page, "Si tu m'");
    const [first, second] = [two.getByRole('textbox').nth(0), two.getByRole('textbox').nth(1)];
    await first.fill('APPRIVOISES');
    await second.fill('auron');
    await checkButton(two).click();
    await expect(two.getByText('Incorrect', { exact: true })).toBeAttached();
    await notStruck(first);
    await struck(second);
    await expect(two.getByText('aurons', { exact: true })).toBeVisible();
    // The right blank has no reference answer beside it.
    await expect(two.getByText('apprivoises', { exact: true })).toHaveCount(0);
  });

  test('a checked row cannot be edited, and the check cannot be repeated', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const item = row(page, 'Je ne');
    const field = item.getByRole('textbox');
    await field.fill('mange');
    await checkButton(item).click();
    await expect(item.getByText('Correct', { exact: true })).toBeAttached();
    await field.press('x');
    await expect(field).toHaveValue('mange');
    await field.press('Enter');
    expect((await stored(page)).attempts).toHaveLength(1);
  });

  test('Check is off until something is typed, and "Check all" checks only what is filled in', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    await expect(checkButton(row(page, 'Je ne'))).toBeDisabled();
    const all = page.getByRole('button', { name: 'Check all' });
    await expect(all).toBeDisabled();
    await expect(page.getByText('0 of 2 checked, 0 right')).toBeVisible();

    await row(page, 'Je ne').getByRole('textbox').fill('mange');
    await expect(all).toBeEnabled();
    await all.click();
    await expect(page.getByText('1 of 2 checked, 1 right')).toBeVisible();
    await expect(all).toBeDisabled();
    // The empty row was not counted as a mistake.
    expect((await stored(page)).attempts).toHaveLength(1);
    await expect(checkButton(row(page, "Si tu m'"))).toBeDisabled();
  });
});

test.describe('choose the option', () => {
  test('right and wrong picks, per group', async ({ page }) => {
    await openUnit(page, 'unit-choice-select', 'Les pronoms personnels');
    const one = row(page, 'Le blé pour');
    await one.getByRole('button', { name: 'moi', exact: true }).click();
    await one.getByRole('button', { name: 'me', exact: true }).click();
    await checkButton(one).click();
    await expect(one.getByText('Correct', { exact: true })).toBeAttached();
    await expect(one.getByRole('button', { name: 'moi', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // After a reset, the second group is answered wrong.
    await page.getByRole('button', { name: 'Reset this unit' }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await one.getByRole('button', { name: 'moi', exact: true }).click();
    await one.getByRole('button', { name: 'te', exact: true }).click();
    await checkButton(one).click();
    await expect(one.getByText('Incorrect', { exact: true })).toBeAttached();
    await struck(one.getByRole('button', { name: 'te', exact: true }));
    await notStruck(one.getByRole('button', { name: 'moi', exact: true }));
    await expect(one.getByText('me', { exact: true }).last()).toBeVisible();
    // The pick stays visible and cannot be changed after the check.
    await one.getByRole('button', { name: 'me', exact: true }).first().click({ force: true });
    await expect(one.getByRole('button', { name: 'te', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const { attempts } = await stored(page);
    // Two attempts exist for cs-1 (right before the reset, wrong after); take the wrong one.
    expect(attempts.find((a: { userAnswer: string }) => a.userAnswer === 'moi / te')).toMatchObject({
      expectedAnswer: 'moi / me',
      correct: false,
    });
  });

  test('one pick is enough to check; the groups left open count as wrong', async ({ page }) => {
    await openUnit(page, 'unit-choice-select', 'Les pronoms personnels');
    const one = row(page, 'Le blé pour');
    await one.getByRole('button', { name: 'moi', exact: true }).click();
    await checkButton(one).click();
    await expect(one.getByText('Incorrect', { exact: true })).toBeAttached();
  });
});

test.describe('transform the word', () => {
  test('a right and a wrong word', async ({ page }) => {
    await openUnit(page, 'unit-word-transform', 'Le féminin des adjectifs');
    const one = row(page, 'intrigué');
    await one.getByRole('textbox').fill('intriguee');
    await checkButton(one).click();
    // Accents are spelling help for now, so the unaccented form is accepted.
    await expect(one.getByText('Correct', { exact: true })).toBeAttached();

    // After a reset, the unchanged masculine form is wrong.
    await page.getByRole('button', { name: 'Reset this unit' }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await one.getByRole('textbox').fill('intrigué');
    await checkButton(one).click();
    await expect(one.getByText('Incorrect', { exact: true })).toBeAttached();
    await struck(one.getByRole('textbox'));
    await expect(one.getByText('intriguée', { exact: true })).toBeVisible();
  });
});

test('an ordinary item speaks its prompt from one Listen control on its meta line', async ({ page, ai }) => {
  ai.ttsDelayMs = 50;
  await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
  const item = row(page, 'Je ne');
  const listen = item.getByRole('button', { name: 'Listen', exact: true });
  await expect(listen).toHaveCount(1);
  const box = (await listen.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(40);
  expect(box.height).toBeGreaterThanOrEqual(40);

  // Through the shared speech layer: the clip is synthesized once, and the pressed control is the stop button.
  await listen.click();
  await expect.poll(() => ai.calls.tts).toBe(1);
  await expect(item.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
});

test('Redo waits disabled until an item is checked, clears that item alone and keeps its attempts', async ({
  page,
}) => {
  await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
  const done = row(page, 'Je ne');
  const wrong = row(page, "Si tu m'");
  const [first, second] = [wrong.getByRole('textbox').nth(0), wrong.getByRole('textbox').nth(1)];
  await first.fill('apprivoise');
  await second.fill('auron');
  await done.getByRole('textbox').fill('mange');
  const redo = wrong.getByRole('button', { name: 'Redo', exact: true });
  await expect(redo).toBeDisabled();

  await checkButton(wrong).click();
  await expect(wrong.getByText('Incorrect', { exact: true })).toBeAttached();
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(redo).toBeDisabled();
  await expect(first).toHaveValue('');
  await expect(first).toBeEditable();
  await expect(done.getByRole('textbox')).toHaveValue('mange');

  // Attempts are history: the mistake stays in the notebook, counted and still to revisit.
  await page.waitForTimeout(400);
  const { attempts, itemStates } = await stored(page);
  expect(attempts).toHaveLength(1);
  expect(itemStates.map((state: { itemId: string }) => state.itemId)).not.toContain('fb-2');

  // The notebook counts it as unresolved, on the My study → Mistakes row.
  await page.goto('/#/study/words');
  const mistakes = page.getByRole('link', { name: /^Mistakes/ });
  await expect(mistakes).toContainText('1');
  await mistakes.click();
  await expect(page.getByRole('listitem').filter({ hasText: "Si tu m'" })).toContainText('To revisit');
});
