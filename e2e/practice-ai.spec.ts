/**
 * The AI parts of a unit (all mocked): open answers get words, never a score; hints and
 * explanations with their flags; failures shown with the real reason; unit reset keeps the history;
 * answers survive a reload; late results after a reset or after leaving are dropped.
 */
import { expect, test } from './fixtures';
import { sampleGrade } from './practiceFixtures';
import { PRACTICE, checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';

test.beforeEach(async ({ page, ai }) => {
  void ai; // onboards the app with a test key and answers every AI request from fixtures
  await seedUnits(page);
});

const QUESTION = 'Que veut le renard';
const SAMPLE = 'Il veut créer des liens avec le petit prince.';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe('open answers', () => {
  test('an answer that matches nothing gets AI feedback in words, with no score', async ({ page, ai }) => {
    await openUnit(page, 'u4', 'Questions ouvertes');
    const item = row(page, QUESTION);
    await expect(
      item.getByText('An AI reads your answer and writes feedback. It is an estimate, not a score.'),
    ).toBeVisible();
    await item.getByRole('textbox').fill('Il veut un ami.');
    await checkButton(item).click();

    await expect(item.getByText('AI feedback.')).toBeVisible();
    await expect(item.getByText('The idea is right, but the answer is not a full sentence with')).toBeVisible();
    await expect(item.locator('strong', { hasText: 'il veut' })).toBeVisible();
    await expect(item.getByText('A better version:')).toBeVisible();
    await expect(item.getByText(SAMPLE, { exact: true }).first()).toBeVisible();
    await expect(item.getByText('Incorrect', { exact: true })).toBeAttached();
    await expect(item.getByText('Sample answer')).toBeVisible();
    await expect(item).not.toContainText(/\d+\s*(\/|%|points)/);

    expect(ai.calls.grade).toBe(1);
    expect(ai.prompts.grade[0]).toContain('Il veut un ami.');
    expect(ai.prompts.grade[0]).toContain(SAMPLE);
    const { itemStates, attempts } = await stored(page);
    expect(itemStates[0].checked).toEqual({
      correct: false,
      aiFeedback: { feedback: sampleGrade.feedback, correctedVersion: sampleGrade.correctedVersion },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ correct: false, userAnswer: 'Il veut un ami.', expectedAnswer: SAMPLE });
  });

  test('the AI can accept another wording', async ({ page, ai }) => {
    ai.answer({ grade: { isCorrect: true, feedback: 'Another good way to say it.' } });
    await openUnit(page, 'u4', 'Questions ouvertes');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill("Il veut qu'on l'apprivoise.");
    await checkButton(item).click();
    await expect(item.getByText('Correct', { exact: true })).toBeAttached();
    await expect(item.getByText('Another good way to say it.')).toBeVisible();
    await expect(item.getByText('A better version:')).toHaveCount(0);
    expect((await stored(page)).attempts[0].correct).toBe(true);
  });

  test('the sample answer needs no AI', async ({ page, ai }) => {
    await openUnit(page, 'u4', 'Questions ouvertes');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill(SAMPLE);
    await checkButton(item).click();
    await expect(item.getByText('Correct', { exact: true })).toBeAttached();
    expect(ai.calls.grade).toBe(0);
    await expect(item.getByText('AI feedback.')).toHaveCount(0);
  });

  test('a failed grade shows the reason, records nothing and can be tried again', async ({ page, ai }) => {
    ai.fail(['grade']);
    await openUnit(page, 'u4', 'Questions ouvertes');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill('Il veut un ami.');
    await checkButton(item).click();
    await expect(item.getByRole('alert')).toContainText('grade failed');
    await expect(item.getByText('Incorrect', { exact: true })).toHaveCount(0);
    await expect(item.getByRole('textbox')).toBeEditable();
    expect((await stored(page)).attempts).toEqual([]);

    ai.fail([]);
    await checkButton(item).click();
    await expect(item.getByText('AI feedback.')).toBeVisible();
    await expect(item.getByRole('alert')).toHaveCount(0);
    expect((await stored(page)).attempts).toHaveLength(1);
  });

  test('an answer the app cannot use is reported through a translated sentence', async ({ page, ai }) => {
    ai.answer({ grade: { isCorrect: 'maybe', feedback: '' } });
    await openUnit(page, 'u4', 'Questions ouvertes');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill('Il veut un ami.');
    await checkButton(item).click();
    await expect(item.getByRole('alert')).toContainText('The AI answer could not be used: ');
    await expect(item.getByRole('alert')).toContainText('isCorrect');
    expect((await stored(page)).attempts).toEqual([]);
  });
});

test.describe('hints and explanations', () => {
  test('Hint shows under the item, loads on its button and saves the flag', async ({ page, ai }) => {
    ai.answer({
      hint: async () => {
        await sleep(500);
        return { hint: 'Look at the **subject**.', grammarRule: '`je` + `suis`', clueWord: 's' };
      },
    });
    await openUnit(page, 'u1', 'Les mots du renard');
    const item = row(page, 'Je ne');
    const hint = item.getByRole('button', { name: 'Hint' });
    const before = await hint.boundingBox();
    await item.getByRole('textbox').fill('es');
    await hint.click();
    await expect(hint).toBeDisabled();
    expect(await hint.boundingBox()).toEqual(before);
    await expect(item.getByText('Look at the')).toBeVisible();
    await expect(item.locator('strong', { hasText: 'subject' })).toBeVisible();
    await expect(item.getByText('Rule:')).toContainText('je + suis');
    await expect(hint).toBeEnabled();
    expect(ai.prompts.hint[0]).toContain('Learner\'s current input: "es"');
    expect(ai.prompts.hint[0]).toContain('Grammar topic: present');

    await expect
      .poll(async () => (await stored(page)).itemStates.map((s: { hintShown: boolean }) => s.hintShown))
      .toEqual([true]);

    // After a reload only the flag is stored; asking again is answered from the saved hint.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Les mots du renard' })).toBeVisible();
    await expect(row(page, 'Je ne').getByText('Look at the')).toHaveCount(0);
    expect((await stored(page)).itemStates[0].hintShown).toBe(true);
    await row(page, 'Je ne').getByRole('button', { name: 'Hint' }).click();
    await expect(row(page, 'Je ne').getByText('Look at the')).toBeVisible();
  });

  test('Hint is for before the check', async ({ page }) => {
    await openUnit(page, 'u1', 'Les mots du renard');
    const item = row(page, 'Je ne');
    await item.getByRole('textbox').fill('suis');
    await checkButton(item).click();
    await expect(item.getByRole('button', { name: 'Hint' })).toBeDisabled();
    // A right answer has nothing to explain.
    await expect(item.getByRole('button', { name: 'Explain' })).toBeDisabled();
  });

  test('a failed hint shows the real reason under the item', async ({ page, ai }) => {
    ai.fail(['hint']);
    await openUnit(page, 'u1', 'Les mots du renard');
    const item = row(page, 'Je ne');
    await item.getByRole('button', { name: 'Hint' }).click();
    await expect(item.getByRole('alert')).toContainText('hint failed');
    ai.fail([]);
    await item.getByRole('button', { name: 'Hint' }).click();
    await expect(item.getByText('Rule:')).toBeVisible();
    await expect(item.getByRole('alert')).toHaveCount(0);
  });

  test('a hint the app cannot use is reported through a translated sentence', async ({ page, ai }) => {
    ai.answer({ hint: { hint: '', grammarRule: 'x' } });
    await openUnit(page, 'u1', 'Les mots du renard');
    const item = row(page, 'Je ne');
    await item.getByRole('button', { name: 'Hint' }).click();
    await expect(item.getByRole('alert')).toContainText('The AI answer could not be used: ');
  });

  test('Explain opens a sheet for a wrong answer and saves the flag', async ({ page, ai }) => {
    await openUnit(page, 'u1', 'Les mots du renard');
    const item = row(page, 'On ne');
    await expect(item.getByRole('button', { name: 'Explain' })).toBeDisabled();
    await item.getByRole('textbox').fill('voie');
    await checkButton(item).click();
    await item.getByRole('button', { name: 'Explain' }).click();

    const sheet = page.getByRole('dialog', { name: 'Explanation' });
    await expect(sheet.getByText('The verb')).toBeVisible();
    await expect(sheet.locator('strong', { hasText: 'être' })).toBeVisible();
    await expect(sheet.getByText('Check the subject first, then pick the form.')).toBeVisible();
    await expect(sheet.getByText('je suis, tu es, il est')).toBeVisible();
    await expect(sheet.getByText('voie')).toBeVisible();
    await expect(sheet.getByText('voit', { exact: true })).toBeVisible();
    expect(ai.prompts.explain[0]).toContain('Expected answer: "voit"');
    await expect
      .poll(async () => (await stored(page)).itemStates.map((s: { explanationShown: boolean }) => s.explanationShown))
      .toEqual([true]);

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    // The sheet reopens from the stored text without asking again.
    await item.getByRole('button', { name: 'Explain' }).click();
    await expect(sheet.getByText('je suis, tu es, il est')).toBeVisible();
    expect(ai.calls.explain).toBe(1);
  });

  test('a failed explanation shows the reason in the sheet with a way to ask again', async ({ page, ai }) => {
    ai.fail(['explain']);
    await openUnit(page, 'u1', 'Les mots du renard');
    const item = row(page, 'On ne');
    await item.getByRole('textbox').fill('voie');
    await checkButton(item).click();
    await item.getByRole('button', { name: 'Explain' }).click();
    const sheet = page.getByRole('dialog', { name: 'Explanation' });
    await expect(sheet.getByRole('alert')).toContainText('explain failed');
    ai.fail([]);
    await sheet.getByRole('button', { name: 'Retry' }).click();
    await expect(sheet.getByText('je suis, tu es, il est')).toBeVisible();
    await expect(sheet.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('history', () => {
  test('resetting a unit clears the sheet, asks first and keeps every attempt', async ({ page }) => {
    await openUnit(page, 'u1', 'Les mots du renard');
    await row(page, 'Je ne').getByRole('textbox').fill('suis');
    await row(page, 'On ne').getByRole('textbox').fill('voie');
    await page.getByRole('button', { name: 'Check all' }).click();
    await expect(page.getByText('2 of 3 checked, 1 right')).toBeVisible();
    expect((await stored(page)).attempts).toHaveLength(2);

    await page.getByRole('button', { name: 'Reset this unit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reset this unit?' });
    await expect(dialog.getByText('Your history of attempts is kept.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('2 of 3 checked, 1 right')).toBeVisible();

    await page.getByRole('button', { name: 'Reset this unit' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('0 of 3 checked, 0 right')).toBeVisible();
    for (const text of ['Je ne', 'On ne']) {
      await expect(row(page, text).getByRole('textbox')).toHaveValue('');
      await expect(row(page, text).getByRole('textbox')).toBeEditable();
    }
    const after = await stored(page);
    expect(after.itemStates).toEqual([]);
    expect(after.attempts).toHaveLength(2);

    // The unit can be done again, and the new attempt joins the old ones.
    await row(page, 'Je ne').getByRole('textbox').fill('suis');
    await checkButton(row(page, 'Je ne')).click();
    await expect(row(page, 'Je ne').getByText('Correct', { exact: true })).toBeAttached();
    expect((await stored(page)).attempts).toHaveLength(3);
  });

  test('a draft and a checked answer are still there after a reload', async ({ page }) => {
    await openUnit(page, 'u1', 'Les mots du renard');
    await row(page, 'On ne').getByRole('textbox').fill('voi');
    const done = row(page, 'Je ne');
    await done.getByRole('textbox').fill('suis');
    await checkButton(done).click();
    await expect(done.getByText('Correct', { exact: true })).toBeAttached();
    await expect
      .poll(async () =>
        (await stored(page)).itemStates.map((s: { answer: { singleAnswer: string } }) => s.answer.singleAnswer).sort(),
      )
      .toEqual(['suis', 'voi']);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Les mots du renard' })).toBeVisible();
    await expect(row(page, 'On ne').getByRole('textbox')).toHaveValue('voi');
    await expect(row(page, 'On ne').getByRole('textbox')).toBeEditable();
    await expect(row(page, 'Je ne').getByRole('textbox')).toHaveValue('suis');
    await expect(row(page, 'Je ne').getByText('Correct', { exact: true })).toBeAttached();
    await expect(page.getByText('1 of 3 checked, 1 right')).toBeVisible();
    // Typing stops being saved once the item is checked.
    expect((await stored(page)).attempts).toHaveLength(1);
  });

  test('a grade that arrives after a reset is dropped', async ({ page, ai }) => {
    ai.answer({
      grade: async () => {
        await sleep(1200);
        return sampleGrade;
      },
    });
    await openUnit(page, 'u4', 'Questions ouvertes');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill('Il veut un ami.');
    await checkButton(item).click();
    await expect.poll(() => ai.calls.grade).toBe(1);
    await page.getByRole('button', { name: 'Reset this unit' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.waitForTimeout(1800);
    await expect(item.getByText('AI feedback.')).toHaveCount(0);
    await expect(item.getByRole('alert')).toHaveCount(0);
    await expect(item.getByRole('textbox')).toHaveValue('');
    const rows = await stored(page);
    expect(rows.attempts).toEqual([]);
    expect(rows.itemStates).toEqual([]);
  });

  test('a grade that arrives after leaving the unit is dropped without an error', async ({ page, ai }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    ai.answer({
      grade: async () => {
        await sleep(1000);
        return sampleGrade;
      },
    });
    await openUnit(page, 'u4', 'Questions ouvertes');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill('Il veut un ami.');
    await checkButton(item).click();
    await expect.poll(() => ai.calls.grade).toBe(1);
    await page.goto(PRACTICE);
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    await page.waitForTimeout(1600);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await stored(page)).attempts).toEqual([]);
    expect(errors).toEqual([]);
    // What was typed is kept as a draft for next time.
    await openUnit(page, 'u4', 'Questions ouvertes');
    await expect(row(page, QUESTION).getByRole('textbox')).toHaveValue('Il veut un ami.');
    await expect(row(page, QUESTION).getByText('AI feedback.')).toHaveCount(0);
  });
});
