/**
 * Layout of the practice screens: nothing sticks out of a phone, checking does not move what is above
 * the pressed button, and long content wraps in light, sepia and dark.
 */
import type { Page } from '@playwright/test';
import { expect, layout, overflowing, settled, test } from './fixtures';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import { PRACTICE, checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';

test.beforeEach(async ({ ai }) => {
  ai.ttsDelayMs = 50;
});

const LONG = 'Supercalifragilisticexpialidocieuxcaractéristiquement';
const longUnit = {
  id: 'long',
  setId: 'set-long',
  setTitle: `Un titre de série très long pour vérifier que tout passe à la ligne ${LONG}`,
  learningArea: 'grammar',
  section: 'GRAMMAIRE',
  unitNumber: 12,
  title: `Un titre de série très long pour vérifier que tout passe à la ligne ${LONG}`,
  instruction: `Complétez chaque phrase avec le mot qui convient, puis vérifiez. ${LONG}`,
  readingPassage: {
    title: `Le renard et le petit prince ${LONG}`,
    content: `Le renard attend un ami. ${LONG}\nLe petit prince l'écoute.`,
    translation: `A supplied translation with a long word: ${LONG}`,
  },
  type: 'FILL_BLANKS',
  grammarTags: ['present', 'adjective-agreement'],
  items: [
    {
      id: 'l1',
      itemNumber: 1,
      prompt: `Le renard, qui est un animal ${LONG}, [___] très attentif quand le petit prince [___] près de lui.`,
      expectedAnswer: [`${LONG}${LONG}`, 'se tient'],
      grammarTag: 'present',
    },
    {
      id: 'l2',
      type: 'CHOICE_SELECT',
      itemNumber: 2,
      prompt:
        'Mais, si tu m’apprivoises, nous {aurons un besoin très grand|avons un besoin très grand} l’un de l’autre.',
      expectedAnswer: 'aurons un besoin très grand',
      grammarTag: 'future',
    },
  ],
};

const theme = (page: Page, value: string) => page.addInitScript((t) => localStorage.setItem('relire_theme', t), value);

test('checking does not move the header, the title or the button that was pressed', async ({ page }) => {
  await seedUnits(page);
  await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
  await settled(page);
  const title = page.getByRole('heading', { name: 'Conjuguer au présent et au futur' });
  const pressedRow = row(page, 'Je ne');
  const below = row(page, "Si tu m'");
  const pressed = checkButton(pressedRow);
  await pressedRow.getByRole('textbox').fill('mangez');

  const before = {
    page: await layout(page, 'main'),
    title: await title.boundingBox(),
    pressed: await pressed.boundingBox(),
    below: await below.boundingBox(),
  };
  await pressed.click();
  await expect(pressedRow.getByText('Incorrect', { exact: true })).toBeAttached();
  await settled(page);
  expect(await title.boundingBox()).toEqual(before.title);
  expect((await pressedRow.getByRole('button', { name: 'Checked' }).boundingBox())!.y).toBe(before.pressed!.y);
  // With room beside the blank for the right answer, the row below stays where it was.
  expect(await below.boundingBox()).toEqual(before.below);
  expect((await layout(page, 'main')).top).toBe(before.page.top);
  expect((await layout(page, 'main')).height).toBe(before.page.height);
});

test('working on an item changes its buttons, not their place', async ({ page, ai }) => {
  ai.answer({
    grade: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { isCorrect: true, feedback: 'Fine.' };
    },
  });
  await seedUnits(page);
  await openUnit(page, 'unit-open-qa', 'Questions sur le texte');
  const item = row(page, 'Quel est le secret');
  await item.getByRole('textbox').fill('Le cœur seul permet de bien voir.');
  const buttons = item.getByRole('button');
  const boxes = async () => Promise.all([0, 1, 2].map((i) => buttons.nth(i).boundingBox()));
  const before = await boxes();
  await checkButton(item).click();
  await expect(item.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
  expect(await boxes()).toEqual(before);
  await expect(item.getByText('Fine.')).toBeVisible();
  expect(await boxes()).toEqual(before);
});

for (const width of [430, 360, 1280])
  test(`a check and a redo leave the next row in place at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await seedUnits(page);
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const done = row(page, 'Je ne');
    const next = row(page, "Si tu m'");
    const redo = done.getByRole('button', { name: 'Redo', exact: true });
    // Redo holds its place while it cannot be used, so checking never adds a line of buttons.
    await expect(redo).toBeDisabled();
    await done.getByRole('textbox').fill('mange');
    await settled(page);
    const place = async () => (await next.boundingBox())!;
    const before = await place();

    await checkButton(done).click();
    await expect(done.getByText('Correct', { exact: true })).toBeAttached();
    await settled(page);
    await expect(redo).toBeEnabled();
    expect(await place()).toEqual(before);

    await redo.click();
    await expect(redo).toBeDisabled();
    await settled(page);
    expect(await place()).toEqual(before);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    expect((await layout(page, 'main')).width).toBeLessThanOrEqual(width);
  });

for (const phone of [false, true]) {
  const suffix = phone ? ' @phone' : '';
  const size = phone ? '360' : '1280';

  test(`the practice page and a unit sheet fit the screen, with long content${suffix}`, async ({ page, ai }) => {
    await seedUnits(page, [...CATALOG_EXERCISES.units, longUnit]);
    await page.goto(PRACTICE);
    await expect(page.getByRole('main').getByRole('link', { name: /Un titre de série très long/ })).toBeVisible();
    await settled(page);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    expect((await layout(page, 'main')).width).toBeLessThanOrEqual(page.viewportSize()!.width);

    await page.locator('main a[href="#/grammar/exercises/set/set-long"]').click();
    await expect(page.getByRole('heading', { name: /Un titre de série très long/ })).toBeVisible();
    await settled(page);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    await page.locator('main a[href="#/grammar/exercises/unit/long"]').click();
    await expect(page.getByRole('heading', { name: /Un titre de série très long/ })).toBeVisible();
    await settled(page);
    expect(await overflowing(page.locator('body'))).toEqual([]);

    // Wrong answers add the right one beside them; it must wrap rather than push out.
    const first = row(page, 'Le renard, qui est');
    await first.getByRole('textbox').nth(0).fill('x');
    await first.getByRole('textbox').nth(1).fill('y');
    const second = row(page, 'Mais, si tu');
    await second.getByRole('button', { name: 'avons un besoin très grand' }).click();
    await page.getByRole('button', { name: 'Check all' }).click();
    await expect(first.getByText('Incorrect', { exact: true })).toBeAttached();
    await expect(second.getByText('Incorrect', { exact: true })).toBeAttached();
    await settled(page);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    expect((await layout(page, 'main')).width).toBeLessThanOrEqual(page.viewportSize()!.width);

    // The character bar and the overlays stay inside the screen too.
    await first.getByRole('textbox').nth(0).focus();
    await page.getByRole('button', { name: 'French characters' }).click();
    const grid = page.getByRole('group', { name: 'French characters' });
    const box = (await grid.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.getByRole('button', { name: 'French characters' }).click();

    // The long unit is not in the catalogue, so the spec supplies the explanation it shows.
    ai.answer({
      explain: {
        summary: `The missing word is **${LONG}**, not what was typed.`,
        details: `The sentence needs \`${LONG}${LONG}\` after the relative clause.\nCheck what the subject is, then choose the ending.`,
        tip: `Read the sentence aloud with ${LONG} in the blank.`,
      },
    });
    await first.getByRole('button', { name: 'Explain' }).click();
    const sheet = page.getByRole('dialog', { name: 'Explanation' });
    await expect(sheet.getByText('Check what the subject is, then choose the ending.')).toBeVisible();
    expect(await overflowing(sheet)).toEqual([]);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Reset this unit' }).click();
    expect(await overflowing(page.getByRole('dialog', { name: 'Reset this unit?' }))).toEqual([]);
  });

  test(`themes: the practice page and a unit sheet in light, sepia and dark at ${size}px${suffix}`, async ({
    page,
  }) => {
    await seedUnits(page);
    await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
    const wrong = row(page, "Si tu m'");
    await wrong.getByRole('textbox').nth(0).fill('apprivoise');
    await wrong.getByRole('textbox').nth(1).fill('auron');
    await page.getByRole('button', { name: 'Check all' }).click();
    await expect(page.getByText('1 of 2 checked, 0 right')).toBeVisible();
    await row(page, 'Je ne').getByRole('button', { name: 'Hint' }).click();
    await expect(row(page, 'Je ne').getByText('Rule:')).toBeVisible();
    await page.goto(PRACTICE);
    await expect(page.locator('main tbody tr')).toContainText('1 of 6 checked');

    for (const mode of ['light', 'sepia', 'dark']) {
      await page.evaluate((m) => localStorage.setItem('relire_theme', m), mode);
      await page.reload();
      await expect(page.locator('main a[href="#/grammar/exercises/set/set-1"]')).toBeVisible();
      await settled(page);
      expect(await overflowing(page.locator('body'))).toEqual([]);
      await page.locator('main a[href="#/grammar/exercises/set/set-1"]').click();
      await settled(page);
      expect(await overflowing(page.locator('body'))).toEqual([]);
      await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
      await row(page, "Si tu m'").getByRole('textbox').nth(0).focus();
      await page.getByRole('button', { name: 'French characters' }).click();
      await settled(page);
      expect(await overflowing(page.locator('body'))).toEqual([]);
      await page.goto(PRACTICE);
    }
  });
}

test('theme tokens: right and wrong keep their meaning in dark', async ({ page }) => {
  await theme(page, 'dark');
  await seedUnits(page);
  await openUnit(page, 'unit-fill-blanks', 'Conjuguer au présent et au futur');
  await row(page, 'Je ne').getByRole('textbox').fill('mange');
  const wrong = row(page, "Si tu m'");
  await wrong.getByRole('textbox').nth(0).fill('apprivoise');
  await wrong.getByRole('textbox').nth(1).fill('aurons');
  await page.getByRole('button', { name: 'Check all' }).click();
  await expect(page.getByText('2 of 2 checked, 1 right')).toBeVisible();
  const rgb = (locator: ReturnType<Page['locator']>) => locator.evaluate((el) => getComputedStyle(el).color);
  const right = await rgb(row(page, 'Je ne').getByRole('textbox'));
  const wrongColor = await rgb(wrong.getByRole('textbox').nth(0));
  expect(right).not.toBe(wrongColor);
  expect((await stored(page)).attempts).toHaveLength(2);
});
