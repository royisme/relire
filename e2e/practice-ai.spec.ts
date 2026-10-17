/**
 * The AI parts of a unit (all mocked from the shared catalogue): open answers get words,
 * never a score; hints and explanations with their flags; failures shown with the real
 * reason; unit reset keeps the history; answers survive a reload; late results after a
 * reset or after leaving are dropped.
 */
import { expect, test } from './fixtures';
import { CATALOG_OPEN_GRADE } from '../tests/fixtures/exerciseCatalog';
import { PRACTICE, checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';

test.beforeEach(async ({ page, ai }) => {
  void ai; // onboards the app with a test key and answers every AI request from fixtures
  await seedUnits(page);
});

const QUESTION = 'Quel est le secret du renard';
const SAMPLE = "On ne voit bien qu'avec le cœur.";
// A wording no reference answer lists, so the AI grader decides it.
const PARAPHRASE = 'Le cœur seul permet de bien voir.';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe('open answers', () => {
  test('an answer that matches nothing gets AI feedback in words, with no score', async ({ page, ai }) => {
    await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
    const item = row(page, QUESTION);
    await expect(
      item.getByText('An AI reads your answer and writes feedback. It is an estimate, not a score.'),
    ).toBeVisible();
    await item.getByRole('textbox').fill(PARAPHRASE);
    await checkButton(item).click();

    await expect(item.getByText('AI feedback.')).toBeVisible();
    await expect(item.getByText("Accepted. The answer gives the fox's secret")).toBeVisible();
    await expect(item.getByText('A better version:')).toBeVisible();
    await expect(item.getByText(SAMPLE, { exact: true }).first()).toBeVisible();
    // The catalogue's grade accepts the paraphrase, so the sample answer is not shown beside it.
    await expect(item.getByText('Sample answer')).toHaveCount(0);
    await expect(item.getByText('Correct', { exact: true })).toBeAttached();
    await expect(item).not.toContainText(/\d+\s*(\/|%|points)/);

    expect(ai.calls.grade).toBe(1);
    expect(ai.prompts.grade[0]).toContain(PARAPHRASE);
    expect(ai.prompts.grade[0]).toContain(SAMPLE);
    const { itemStates, attempts } = await stored(page);
    expect(itemStates[0].checked).toEqual({
      correct: true,
      strictAccents: false,
      aiFeedback: { feedback: CATALOG_OPEN_GRADE.feedback, correctedVersion: CATALOG_OPEN_GRADE.correctedVersion },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ correct: true, userAnswer: PARAPHRASE, expectedAnswer: SAMPLE });
  });

  test('a rejected answer is struck through with the sample answer beside it', async ({ page, ai }) => {
    ai.answer({ grade: { isCorrect: false, feedback: 'The idea is there, but this is not a French sentence.' } });
    await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill(PARAPHRASE);
    await checkButton(item).click();
    await expect(item.getByText('Incorrect', { exact: true })).toBeAttached();
    await expect(item.getByText('The idea is there, but this is not a French sentence.')).toBeVisible();
    await expect(item.getByText('Sample answer')).toBeVisible();
    await expect(item.getByText('A better version:')).toHaveCount(0);
    await expect(item.getByRole('textbox')).toHaveCSS('text-decoration-line', 'line-through');
    expect((await stored(page)).attempts[0].correct).toBe(false);
  });

  test('the sample answer needs no AI', async ({ page, ai }) => {
    await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill(SAMPLE);
    await checkButton(item).click();
    await expect(item.getByText('Correct', { exact: true })).toBeAttached();
    expect(ai.calls.grade).toBe(0);
    await expect(item.getByText('AI feedback.')).toHaveCount(0);
  });

  test('a failed grade shows the reason, records nothing and can be tried again', async ({ page, ai }) => {
    ai.fail(['grade']);
    await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill(PARAPHRASE);
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
    await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill(PARAPHRASE);
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
        return {
          hint: "Look at the subject 'je' and the ending a regular -er verb takes with it.",
          grammarRule: "Regular -er verbs such as manger take -e with 'je' in the present tense.",
          clueWord: 'Je',
        };
      },
    });
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const item = row(page, 'Je ne');
    const hint = item.getByRole('button', { name: 'Hint' });
    const before = await hint.boundingBox();
    await item.getByRole('textbox').fill('mangez');
    await hint.click();
    await expect(hint).toBeDisabled();
    expect(await hint.boundingBox()).toEqual(before);
    await expect(item.getByText("Look at the subject 'je'")).toBeVisible();
    await expect(item.getByText('Rule:')).toContainText('Regular -er verbs such as manger');
    await expect(item.getByText('Clue:')).toContainText('Je');
    await expect(hint).toBeEnabled();
    expect(ai.prompts.hint[0]).toContain('Learner\'s current input: "mangez"');
    expect(ai.prompts.hint[0]).toContain('Grammar topic: present');

    await expect
      .poll(async () => (await stored(page)).itemStates.map((s: { hintShown: boolean }) => s.hintShown))
      .toEqual([true]);

    // After a reload only the flag is stored; asking again is answered from the saved hint.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Conjuguer au présent et au futur' })).toBeVisible();
    await expect(row(page, 'Je ne').getByText("Look at the subject 'je'")).toHaveCount(0);
    expect((await stored(page)).itemStates[0].hintShown).toBe(true);
    await row(page, 'Je ne').getByRole('button', { name: 'Hint' }).click();
    await expect(row(page, 'Je ne').getByText("Look at the subject 'je'")).toBeVisible();
  });

  test('Hint is for before the check', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const item = row(page, 'Je ne');
    await item.getByRole('textbox').fill('mange');
    await checkButton(item).click();
    await expect(item.getByRole('button', { name: 'Hint' })).toBeDisabled();
    // A right answer has nothing to explain.
    await expect(item.getByRole('button', { name: 'Explain' })).toBeDisabled();
  });

  test('a failed hint shows the real reason under the item', async ({ page, ai }) => {
    ai.fail(['hint']);
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
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
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const item = row(page, 'Je ne');
    await item.getByRole('button', { name: 'Hint' }).click();
    await expect(item.getByRole('alert')).toContainText('The AI answer could not be used: ');
  });

  test('Explain opens a sheet for a wrong answer and saves the flag', async ({ page, ai }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const item = row(page, 'Je ne');
    await expect(item.getByRole('button', { name: 'Explain' })).toBeDisabled();
    await item.getByRole('textbox').fill('mangez');
    await checkButton(item).click();
    await item.getByRole('button', { name: 'Explain' }).click();

    const sheet = page.getByRole('dialog', { name: 'Explanation' });
    await expect(sheet.getByText("With 'je', an -er verb ends in -e, not -ez.")).toBeVisible();
    await expect(sheet.getByText('Manger is a regular -er verb.')).toBeVisible();
    await expect(sheet.getByText('Check the subject first, then choose the ending.')).toBeVisible();
    await expect(sheet.getByText('mangez')).toBeVisible();
    await expect(sheet.getByText('Correct answer:', { exact: true }).locator('..')).toHaveText('Correct answer: mange');
    expect(ai.prompts.explain[0]).toContain('Expected answer: "mange"');
    await expect
      .poll(async () => (await stored(page)).itemStates.map((s: { explanationShown: boolean }) => s.explanationShown))
      .toEqual([true]);

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    // The sheet reopens from the stored text without asking again.
    await item.getByRole('button', { name: 'Explain' }).click();
    await expect(sheet.getByText('Check the subject first, then choose the ending.')).toBeVisible();
    expect(ai.calls.explain).toBe(1);
  });

  test('a failed explanation shows the reason in the sheet with a way to ask again', async ({ page, ai }) => {
    ai.fail(['explain']);
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const item = row(page, 'Je ne');
    await item.getByRole('textbox').fill('mangez');
    await checkButton(item).click();
    await item.getByRole('button', { name: 'Explain' }).click();
    const sheet = page.getByRole('dialog', { name: 'Explanation' });
    await expect(sheet.getByRole('alert')).toContainText('explain failed');
    ai.fail([]);
    await sheet.getByRole('button', { name: 'Retry' }).click();
    await expect(sheet.getByText('Check the subject first, then choose the ending.')).toBeVisible();
    await expect(sheet.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('history', () => {
  test('resetting a unit clears the sheet, asks first and keeps every attempt', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    await row(page, 'Je ne').getByRole('textbox').fill('mange');
    const wrong = row(page, "Si tu m'");
    await wrong.getByRole('textbox').nth(0).fill('apprivoise');
    await wrong.getByRole('textbox').nth(1).fill('aurons');
    await page.getByRole('button', { name: 'Check all' }).click();
    await expect(page.getByText('2 of 2 checked, 1 right')).toBeVisible();
    expect((await stored(page)).attempts).toHaveLength(2);

    await page.getByRole('button', { name: 'Reset this unit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reset this unit?' });
    await expect(dialog.getByText('Your history of attempts is kept.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('2 of 2 checked, 1 right')).toBeVisible();

    await page.getByRole('button', { name: 'Reset this unit' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('0 of 2 checked, 0 right')).toBeVisible();
    await expect(row(page, 'Je ne').getByRole('textbox')).toHaveValue('');
    await expect(row(page, 'Je ne').getByRole('textbox')).toBeEditable();
    for (const blank of [0, 1]) {
      await expect(row(page, "Si tu m'").getByRole('textbox').nth(blank)).toHaveValue('');
      await expect(row(page, "Si tu m'").getByRole('textbox').nth(blank)).toBeEditable();
    }
    const after = await stored(page);
    expect(after.itemStates).toEqual([]);
    expect(after.attempts).toHaveLength(2);

    // The unit can be done again, and the new attempt joins the old ones.
    await row(page, 'Je ne').getByRole('textbox').fill('mange');
    await checkButton(row(page, 'Je ne')).click();
    await expect(row(page, 'Je ne').getByText('Correct', { exact: true })).toBeAttached();
    expect((await stored(page)).attempts).toHaveLength(3);
  });

  test('a draft and a checked answer are still there after a reload', async ({ page }) => {
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    await row(page, "Si tu m'").getByRole('textbox').nth(0).fill('apprivois');
    const done = row(page, 'Je ne');
    await done.getByRole('textbox').fill('mange');
    await checkButton(done).click();
    await expect(done.getByText('Correct', { exact: true })).toBeAttached();
    await expect
      .poll(async () =>
        (await stored(page)).itemStates
          .map((s: { answer: { singleAnswer: string; multiAnswers: string[] } }) =>
            (s.answer.singleAnswer || s.answer.multiAnswers.join('')).trim(),
          )
          .sort(),
      )
      .toEqual(['apprivois', 'mange']);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Conjuguer au présent et au futur' })).toBeVisible();
    await expect(row(page, "Si tu m'").getByRole('textbox').nth(0)).toHaveValue('apprivois');
    await expect(row(page, "Si tu m'").getByRole('textbox').nth(0)).toBeEditable();
    await expect(row(page, 'Je ne').getByRole('textbox')).toHaveValue('mange');
    await expect(row(page, 'Je ne').getByText('Correct', { exact: true })).toBeAttached();
    await expect(page.getByText('1 of 2 checked, 1 right')).toBeVisible();
    // Typing stops being saved once the item is checked.
    expect((await stored(page)).attempts).toHaveLength(1);
  });

  test('a grade that arrives after a reset is dropped', async ({ page, ai }) => {
    ai.answer({
      grade: async () => {
        await sleep(1200);
        return CATALOG_OPEN_GRADE;
      },
    });
    await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill(PARAPHRASE);
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
        return CATALOG_OPEN_GRADE;
      },
    });
    await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
    const item = row(page, QUESTION);
    await item.getByRole('textbox').fill(PARAPHRASE);
    await checkButton(item).click();
    await expect.poll(() => ai.calls.grade).toBe(1);
    await page.goto(PRACTICE);
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    await page.waitForTimeout(1600);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await stored(page)).attempts).toEqual([]);
    expect(errors).toEqual([]);
    // What was typed is kept as a draft for next time.
    await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
    await expect(row(page, QUESTION).getByRole('textbox')).toHaveValue(PARAPHRASE);
    await expect(row(page, QUESTION).getByText('AI feedback.')).toHaveCount(0);
  });
});
