/**
 * Layout of the practice screens: nothing sticks out of a phone, checking does not move what is above
 * the pressed button, and long content wraps. Also writes screenshots (light, sepia, dark) that are
 * attached to the report, so the screens can be looked at.
 */
import type { Page } from '@playwright/test';
import { expect, layout, overflowing, settled, test } from './fixtures';
import { PRACTICE, checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';
import { sampleExercises } from './practiceFixtures';

test.beforeEach(async ({ ai }) => {
  ai.ttsDelayMs = 50;
});

const LONG = 'Supercalifragilisticexpialidocieuxcaractéristiquement';
const longUnit = {
  id: 'long',
  section: 'GRAMMAIRE',
  unitNumber: 9,
  title: `Un titre de série très long pour vérifier que tout passe à la ligne ${LONG}`,
  instruction: `Complétez chaque phrase avec le mot qui convient, puis vérifiez. ${LONG}`,
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

async function look(page: Page, name: string) {
  await settled(page);
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await test.info().attach(name, { path, contentType: 'image/png' });
}

const theme = (page: Page, value: string) => page.addInitScript((t) => localStorage.setItem('relire_theme', t), value);

test('checking does not move the header, the title or the button that was pressed', async ({ page }) => {
  await seedUnits(page);
  await openUnit(page, 'u1', 'Les mots du renard');
  await settled(page);
  const title = page.getByRole('heading', { name: 'Les mots du renard' });
  const second = row(page, 'invisible');
  const third = row(page, 'On ne');
  const pressed = checkButton(second);
  await second.getByRole('textbox').nth(0).fill('est');
  await second.getByRole('textbox').nth(1).fill('par');

  const before = {
    page: await layout(page, 'main'),
    title: await title.boundingBox(),
    first: await row(page, 'Je ne').boundingBox(),
    pressed: await pressed.boundingBox(),
    below: await third.boundingBox(),
  };
  await pressed.click();
  await expect(second.getByText('Incorrect', { exact: true })).toBeAttached();
  await settled(page);
  expect(await title.boundingBox()).toEqual(before.title);
  expect(await row(page, 'Je ne').boundingBox()).toEqual(before.first);
  expect((await second.getByRole('button', { name: 'Checked' }).boundingBox())!.y).toBe(before.pressed!.y);
  // With room beside the blank for the right answer, the rows below stay where they were.
  expect(await third.boundingBox()).toEqual(before.below);
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
  await openUnit(page, 'u4', 'Questions ouvertes');
  const item = row(page, 'Que veut le renard');
  await item.getByRole('textbox').fill('Il veut un ami.');
  const buttons = item.getByRole('button');
  const boxes = async () => Promise.all([0, 1, 2].map((i) => buttons.nth(i).boundingBox()));
  const before = await boxes();
  await checkButton(item).click();
  await expect(item.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
  expect(await boxes()).toEqual(before);
  await expect(item.getByText('Fine.')).toBeVisible();
  expect(await boxes()).toEqual(before);
});

for (const phone of [false, true]) {
  const suffix = phone ? ' @phone' : '';
  const size = phone ? '360' : '1280';

  test(`the practice page and a unit sheet fit the screen, with long content${suffix}`, async ({ page }) => {
    await seedUnits(page, [...sampleExercises.units, longUnit]);
    await page.goto(PRACTICE);
    await expect(page.getByRole('main').getByRole('link', { name: /Un titre de série très long/ })).toBeVisible();
    await settled(page);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    expect((await layout(page, 'main')).width).toBeLessThanOrEqual(page.viewportSize()!.width);

    await openUnit(page, 'long', 'Un titre de série très long');
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

    await first.getByRole('button', { name: 'Explain' }).click();
    const sheet = page.getByRole('dialog', { name: 'Explanation' });
    await expect(sheet.getByText('je suis, tu es, il est')).toBeVisible();
    expect(await overflowing(sheet)).toEqual([]);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Reset this unit' }).click();
    expect(await overflowing(page.getByRole('dialog', { name: 'Reset this unit?' }))).toEqual([]);
  });

  test(`looks: the practice page and a unit sheet in light, sepia and dark at ${size}px${suffix}`, async ({ page }) => {
    await seedUnits(page);
    await openUnit(page, 'u1', 'Les mots du renard');
    await row(page, 'Je ne').getByRole('textbox').fill('suis');
    await row(page, 'On ne').getByRole('textbox').fill('voie');
    await page.getByRole('button', { name: 'Check all' }).click();
    await expect(page.getByText('2 of 3 checked, 1 right')).toBeVisible();
    await row(page, 'invisible').getByRole('button', { name: 'Hint' }).click();
    await expect(row(page, 'invisible').getByText('Rule:')).toBeVisible();
    await page.goto(PRACTICE);
    await expect(page.getByRole('main').getByRole('link', { name: /Les mots du renard/ })).toContainText(
      '2 of 3 checked',
    );

    for (const mode of ['light', 'sepia', 'dark']) {
      await page.evaluate((m) => localStorage.setItem('relire_theme', m), mode);
      await page.reload();
      await expect(page.getByRole('main').getByRole('link', { name: /Les mots du renard/ })).toBeVisible();
      await look(page, `practice-${mode}-${size}`);
      await openUnit(page, 'u1', 'Les mots du renard');
      await row(page, 'invisible').getByRole('textbox').nth(0).focus();
      await page.getByRole('button', { name: 'French characters' }).click();
      await look(page, `unit-${mode}-${size}`);
      await page.goto(PRACTICE);
    }
  });
}

test('theme tokens: right and wrong keep their meaning in dark', async ({ page }) => {
  await theme(page, 'dark');
  await seedUnits(page);
  await openUnit(page, 'u1', 'Les mots du renard');
  await row(page, 'Je ne').getByRole('textbox').fill('suis');
  await row(page, 'On ne').getByRole('textbox').fill('voie');
  await page.getByRole('button', { name: 'Check all' }).click();
  await expect(page.getByText('2 of 3 checked, 1 right')).toBeVisible();
  const rgb = (locator: ReturnType<Page['locator']>) => locator.evaluate((el) => getComputedStyle(el).color);
  const right = await rgb(row(page, 'Je ne').getByRole('textbox'));
  const wrong = await rgb(row(page, 'On ne').getByRole('textbox'));
  expect(right).not.toBe(wrong);
  expect((await stored(page)).attempts).toHaveLength(2);
});
