/** Source-word cross-links reuse the real practice catalogue and mocked AI, without a second reader. */
import { expect, test, defaultAnswers, layout, overflowing, settled } from './fixtures';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import { checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';

const TITLE = 'Conjuguer au présent et au futur';
const UNIT = 'unit-fill-blanks';
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
const wordAnswer = (word: string) => ({ ...(defaultAnswers.word as object), word, lemma: word });

for (const phone of [false, true]) {
  test(`prompt word lookup retries with explicit unit context, saves to My study and preserves input keys ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    await page.addInitScript((theme) => localStorage.setItem('relire_theme', theme), phone ? 'dark' : 'light');
    const units = structuredClone(CATALOG_EXERCISES.units);
    const sourceUnit = units.find((unit) => unit.id === UNIT)!;
    sourceUnit.items[0].prompt = 'L’ami, **pain** et `cœur` : Je ne [___] pas. <img src=x onerror=alert(1)>';
    await seedUnits(page, units);
    // Reading something else first must not supply the exercise lookup's context.
    await page.goto('/#/read/cafe-parisien');
    await expect(page.getByRole('heading', { name: /Café Parisien/ })).toBeVisible();
    await page.evaluate((id) => {
      location.hash = `#/practice/${id}`;
    }, UNIT);
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
    await settled(page);
    const item = row(page, 'L’ami');
    const field = item.getByRole('textbox');
    await field.fill('mange');
    await expect(item.locator('strong')).toHaveText('pain');
    await expect(item.locator('code')).toHaveText('cœur');
    await expect(item).toContainText('L’ami, pain et cœur : Je ne');
    await expect(item).toContainText('<img src=x onerror=alert(1)>');
    await expect(item.locator('img')).toHaveCount(0);
    const token = item.getByRole('button', { name: 'L’ami', exact: true });
    await token.focus();
    await settled(page);
    const before = await layout(page, 'main');
    const scrollBefore = await page.evaluate(() => scrollY);
    ai.fail(['word']);
    await token.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'ami', exact: true });
    await expect(sheet.getByRole('alert')).toContainText('word failed');
    expect((await stored(page)).attempts).toHaveLength(0);
    expect(await layout(page, 'main')).toEqual(before);
    const original = ai.prompts.word[0];
    expect(original).toContain(sourceUnit.instruction);
    expect(original).toContain('Sentence context: "L’ami, **pain** et `cœur`');
    expect(original).not.toContain('À Paris, le café');
    expect(original).not.toContain('Un jour, le Petit Prince');
    ai.fail([]);
    ai.answer({ word: wordAnswer('ami') });
    await sheet.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Save word' })).toBeVisible();
    expect(ai.prompts.word.at(-1)).toBe(original);
    await sheet.getByRole('button', { name: 'Save word' }).click();
    await sheet.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(token).toBeFocused();
    expect(await layout(page, 'main')).toEqual(before);
    expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
    await token.press('Space');
    await expect(sheet).toBeVisible();
    expect((await stored(page)).attempts).toHaveLength(0);
    await page.keyboard.press('Escape');
    await expect(token).toBeFocused();
    await field.focus();
    await field.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    await field.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 });
    expect((await stored(page)).attempts).toHaveLength(0);
    await page.getByRole('button', { name: 'French characters' }).click();
    await page
      .getByRole('group', { name: 'French characters' })
      .getByRole('button', { name: 'é', exact: true })
      .click();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('mangeé');
    await field.fill('mange');
    await field.press('Enter');
    await expect(item.getByText('Correct', { exact: true })).toBeAttached();
    expect((await stored(page)).attempts).toHaveLength(1);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    await page.goto('/#/study/words');
    await expect(page.getByText('ami', { exact: true }).first()).toBeVisible();
  });

  test(`passage and explanation words retain source and stack with sensible Escape/focus ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    await page.addInitScript(() => localStorage.setItem('relire_theme', 'sepia'));
    await seedUnits(page);
    await openUnit(page, 'unit-reading-cloze', 'Compléter le passage');
    ai.answer({ word: wordAnswer('monotone') });
    const passage = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Le renard et les poules' }) })
      .last();
    const token = passage.getByRole('button', { name: 'monotone', exact: true });
    await token.focus();
    await token.press('Enter');
    await expect(
      page.getByRole('dialog', { name: 'monotone' }).getByRole('button', { name: 'Save word' }),
    ).toBeVisible();
    const context = CATALOG_EXERCISES.units.find((unit) => unit.id === 'unit-reading-cloze')!;
    expect(ai.prompts.word[0]).toContain(context.readingPassage!.content);
    expect(ai.prompts.word[0]).toContain(context.instruction);
    expect(ai.prompts.word[0]).not.toContain('Un jour, le Petit Prince');
    await page.keyboard.press('Escape');
    await expect(token).toBeFocused();
    await expect(page.getByRole('link', { name: 'Open in the reader' })).toHaveAttribute(
      'href',
      '#/passage/unit-reading-cloze',
    );
    const item = row(page, 'Le renard dit');
    await item.getByRole('textbox').nth(0).fill('chassons');
    await item.getByRole('textbox').nth(1).fill('chassent');
    await checkButton(item).click();
    ai.answer({
      explain: {
        summary: '**Accord** et `verbe`.',
        details: 'L’enfant, <script>alert(1)</script> [lien](javascript:alert(2)).',
        tip: 'Relisez.',
      },
    });
    const explain = item.getByRole('button', { name: 'Explain', exact: true });
    await explain.click();
    const explanation = page.getByRole('dialog', { name: 'Explanation', exact: true });
    await expect(explanation.locator('strong')).toHaveText('Accord');
    await expect(explanation.locator('code')).toHaveText('verbe');
    await expect(explanation).toContainText('<script>alert(1)</script> [lien](javascript:alert(2)).');
    await expect(explanation.locator('script, a')).toHaveCount(0);
    ai.answer({ word: wordAnswer('enfant') });
    const explainedToken = explanation.getByRole('button', { name: 'L’enfant', exact: true });
    await explainedToken.focus();
    await settled(page);
    const before = await layout(page, 'main');
    await explainedToken.press('Space');
    const word = page.getByRole('dialog', { name: 'enfant', exact: true });
    await expect(word.getByRole('button', { name: 'Save word' })).toBeVisible();
    await expect(word).toBeFocused();
    expect(ai.prompts.word.at(-1)).toContain(context.instruction);
    expect(ai.prompts.word.at(-1)).toContain(context.readingPassage!.content);
    expect(await overflowing(word)).toEqual([]);
    expect(await layout(page, 'main')).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(word).toHaveCount(0);
    await expect(explanation).toBeVisible();
    await expect(explainedToken).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(explanation).toHaveCount(0);
    await expect(explain).toBeFocused();
    expect(await overflowing(page.locator('body'))).toEqual([]);
  });
}

for (const fail of [false, true]) {
  test(`native route change drops pending exercise lookup ${fail ? 'failure' : 'success'} and keeps newer lookup`, async ({
    page,
    ai,
  }) => {
    await seedUnits(page);
    await openUnit(page, UNIT, TITLE);
    let release!: () => void;
    const pending = new Promise<void>((done) => {
      release = done;
    });
    ai.answer({
      word: async () => {
        await pending;
        if (fail) throw new Error('late word failure');
        return wordAnswer('pain');
      },
    });
    await row(page, 'Je ne').getByRole('button', { name: 'pain', exact: true }).click();
    await expect.poll(() => ai.calls.word).toBe(1);
    await page.evaluate(() => {
      location.hash = '#/practice/unit-word-transform';
    });
    await expect(page.getByRole('heading', { name: 'Le féminin des adjectifs' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    ai.answer({ word: wordAnswer('intrigué') });
    await page.getByRole('button', { name: 'intrigué', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'intrigué' }).getByRole('button', { name: 'Save word' }),
    ).toBeVisible();
    release();
    await pause(800);
    await expect(page.getByRole('dialog', { name: 'intrigué' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('answer choices/tiles never contain lookup controls and dictation audio stays hidden', async ({ page, ai }) => {
  void ai;
  await seedUnits(page);
  for (const unit of CATALOG_EXERCISES.units) {
    await openUnit(page, unit.id, unit.title);
    await expect(page.locator('main button [data-reader-word], main [role="radio"] [data-reader-word]')).toHaveCount(0);
    if (unit.type === 'NUMBER_DICTATION') {
      for (const item of unit.items) {
        if (item.audioText) await expect(page.locator('main')).not.toContainText(item.audioText);
      }
    }
  }
});
