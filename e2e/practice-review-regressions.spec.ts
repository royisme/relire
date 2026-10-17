/** Bounded P3-D review regressions; fixtures are local to avoid changing the practice catalogue. */
import type { Page } from '@playwright/test';
import { expect, overflowing, settled, test } from './fixtures';
import { checkButton, openUnit, row, seedUnits, stored } from './practice.helpers';
import { unitOf, ITEMS } from '../tests/fixtures/units';

const sentence = {
  ...unitOf('SENTENCE_BUILD', [
    {
      ...ITEMS.SENTENCE_BUILD,
      itemNumber: 1,
      prompt: 'Construisez la phrase.',
      options: ['tout le monde', 'le voit', 'ici.'],
      expectedAnswer: 'tout le monde le voit ici.',
    },
  ]),
  title: 'Review sentence',
};
const dictation = { ...unitOf('NUMBER_DICTATION'), title: 'Review dictation' };

async function openSentence(page: Page) {
  await seedUnits(page, [sentence]);
  await openUnit(page, sentence.id, sentence.title);
  const one = row(page, 'Construisez la phrase.');
  return {
    one,
    bank: one.getByRole('group', { name: 'Item 1, word tiles' }),
    built: one.getByRole('group', { name: 'Item 1, your sentence' }),
  };
}

test('supplied sentence options use word tiles and retain duplicate occurrences', async ({ page, ai }) => {
  void ai;
  const { one, bank, built } = await openSentence(page);
  await expect(bank.getByRole('button')).toHaveCount(6);
  await expect(bank.getByRole('button', { name: 'le', exact: true })).toHaveCount(2);
  await bank.getByRole('button', { name: 'le', exact: true }).first().click();
  await expect(bank.getByRole('button', { name: 'le', exact: true })).toHaveCount(1);
  await built.getByRole('button', { name: 'Remove le', exact: true }).click();
  await expect(bank.getByRole('button', { name: 'le', exact: true })).toHaveCount(2);
  for (const word of ['tout', 'le', 'monde', 'le', 'voit', 'ici.'])
    await bank.getByRole('button', { name: word, exact: true }).first().click();
  await checkButton(one).click();
  await expect(one.getByText('Correct', { exact: true })).toBeAttached();
  expect((await stored(page)).attempts[0].userAnswer).toBe('tout le monde le voit ici.');
  await page.reload();
  await expect(bank.getByRole('button')).toHaveCount(0);
  await expect(built.getByRole('button')).toHaveCount(6);
});

test('sentence transfers keep keyboard focus and remaining duplicate DOM identities', async ({ page, ai }) => {
  void ai;
  // Single-word options isolate focus from the separate multiword normalization regression.
  await seedUnits(page, [{ ...sentence, items: [{ ...sentence.items[0], options: ['le', 'le', 'voit'] }] }]);
  await openUnit(page, sentence.id, sentence.title);
  const one = row(page, 'Construisez la phrase.');
  const bank = one.getByRole('group', { name: 'Item 1, word tiles' });
  const built = one.getByRole('group', { name: 'Item 1, your sentence' });
  const duplicates = bank.getByRole('button', { name: 'le', exact: true });
  await duplicates.last().evaluate((node) => {
    node.setAttribute('data-review-occurrence', 'remaining');
  });
  await duplicates.first().focus();
  await page.keyboard.press('Enter');
  await expect(one.locator(':focus')).toHaveCount(1);
  await expect(bank.locator('[data-review-occurrence="remaining"]')).toHaveText('le');
  while (await bank.getByRole('button').count()) {
    await expect(bank.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Enter');
  }
  await expect(built.locator(':focus')).toHaveCount(1);
  const placedDuplicates = built.getByRole('button', { name: 'Remove le', exact: true });
  await placedDuplicates.last().evaluate((node) => {
    node.setAttribute('data-review-occurrence', 'placed');
  });
  await placedDuplicates.first().click();
  await expect(built.locator('[data-review-occurrence="placed"]')).toHaveText('le');
  while (await built.getByRole('button').count()) {
    await page.keyboard.press('Enter');
    if (await built.getByRole('button').count()) await expect(built.locator(':focus')).toHaveCount(1);
  }
  await expect(bank.locator(':focus')).toHaveCount(1);
});

for (const phone of [false, true])
  test(`sentence transfers keep following controls still${phone ? ' @phone' : ''}`, async ({ page, ai }) => {
    void ai;
    await seedUnits(page, [
      {
        ...sentence,
        items: [
          {
            ...sentence.items[0],
            options: [
              'Lorsque tout le monde arrive ensemble',
              'le responsable explique patiemment les différentes possibilités',
              'de participation aux activités culturelles de la bibliothèque municipale.',
            ],
          },
        ],
      },
    ]);
    await openUnit(page, sentence.id, sentence.title);
    const one = row(page, 'Construisez la phrase.');
    const bank = one.getByRole('group', { name: 'Item 1, word tiles' });
    const built = one.getByRole('group', { name: 'Item 1, your sentence' });
    await settled(page);
    const top = () => checkButton(one).evaluate((node) => node.getBoundingClientRect().top + scrollY);
    const before = await top();
    while (await bank.getByRole('button').count()) {
      await bank.getByRole('button').first().click();
      expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
    }
    expect(await overflowing(page.locator('body'))).toEqual([]);
    for (const theme of ['light', 'sepia', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await page.screenshot({ path: test.info().outputPath(`sentence-${phone ? 360 : 1280}-${theme}.png`) });
    }
    while (await built.getByRole('button').count()) {
      await built.getByRole('button').first().click();
      expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
    }
  });

test('dictation replays on each check after reset, uses cached playback, and stays silent on reload', async ({
  page,
  ai,
}) => {
  await page.addInitScript(() => {
    const settings = JSON.parse(localStorage.getItem('relire_app_settings_v1') || '{}');
    localStorage.setItem('relire_app_settings_v1', JSON.stringify({ ...settings, practiceSpeakAfterCheck: true }));
    // oxlint-disable-next-line typescript/unbound-method
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      sessionStorage.setItem(
        'reviewPlaybackCount',
        String(Number(sessionStorage.getItem('reviewPlaybackCount') || 0) + 1),
      );
      return play.call(this);
    };
  });
  await seedUnits(page, [dictation]);
  await openUnit(page, dictation.id, dictation.title);
  const one = row(page, dictation.items[0].prompt);
  const playbacks = () => page.evaluate(() => Number(sessionStorage.getItem('reviewPlaybackCount') || 0));
  const check = async (count: number) => {
    await one.getByRole('textbox').fill('dix-huit');
    await checkButton(one).click();
    await expect(one.getByText('Correct', { exact: true })).toBeAttached();
    await expect.poll(playbacks).toBe(count);
    await expect(one.getByRole('button', { name: 'Listen', exact: true })).toBeVisible();
  };
  const reset = async () => {
    await page.getByRole('button', { name: 'Reset this unit' }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(one.getByRole('textbox')).toHaveValue('');
  };
  await check(1);
  await reset();
  await check(2);
  expect(ai.calls.tts).toBe(1);
  await page.reload();
  await expect(one.getByRole('textbox')).toHaveValue('dix-huit');
  await page.waitForTimeout(500);
  expect(await playbacks()).toBe(2);
  await reset();
  await check(3);
  expect(ai.calls.tts).toBe(1);
});

const accentUnit = {
  ...unitOf('FILL_BLANKS', [
    {
      ...ITEMS.CHOICE_SELECT,
      id: 'accent-choice',
      type: 'CHOICE_SELECT' as const,
      itemNumber: 1,
      prompt: 'Il pense {a|à} elle.',
      expectedAnswer: 'à',
    },
    {
      ...ITEMS.FILL_BLANKS_MULTI,
      id: 'accent-blanks',
      itemNumber: 2,
      prompt: 'Elle [___] ici et [___] demain.',
      expectedAnswer: ['arrive', 'répète'],
    },
    {
      ...ITEMS.WORD_TRANSFORM,
      id: 'accent-single',
      type: 'WORD_TRANSFORM' as const,
      itemNumber: 3,
      prompt: 'intrigué',
      expectedAnswer: 'intriguée',
    },
    {
      ...ITEMS.DIALOGUE_ORDER,
      id: 'accent-dialogue',
      type: 'DIALOGUE_ORDER' as const,
      itemNumber: 4,
      prompt: 'Ordonnez les deux répliques.',
      options: ['a - Au revoir.', 'b - Bonjour.'],
      expectedAnswer: ['b', 'a'],
    },
  ]),
  title: 'Historical accents',
};

type ReviewDb = typeof import('../src/storage/db');

for (const strictAccents of [false, true]) {
  for (const phone of [false, true])
    test(`checked accents stay at ${strictAccents} through preference changes, reload, backup restore and legacy metadata${phone ? ' @phone' : ''}`, async ({
      page,
      ai,
    }) => {
      void ai;
      await seedUnits(page, [accentUnit]);
      const preference = async (strict: boolean) => {
        await page.goto('/#/settings/practice');
        const checkbox = page.getByRole('checkbox', { name: 'Strict accents' });
        await checkbox.setChecked(strict);
        const save = page.getByRole('button', { name: 'Save', exact: true });
        if (await save.isEnabled()) await save.click();
      };
      await preference(strictAccents);
      await openUnit(page, accentUnit.id, accentUnit.title);
      const choice = row(page, 'Il pense');
      const blanks = row(page, 'demain.');
      const single = row(page, 'intrigué');
      const dialogue = row(page, 'Ordonnez');
      const chosen = choice.getByRole('button', { name: 'a', exact: true });
      await chosen.click();
      await blanks.getByRole('textbox').nth(0).fill('faux');
      await blanks.getByRole('textbox').nth(1).fill('repete');
      await single.getByRole('textbox').fill('intriguee');
      await page.getByRole('button', { name: 'Check all', exact: true }).click();
      await expect(dialogue.getByText('Incorrect', { exact: true })).toBeAttached();
      const historicalMarks = async () => {
        await expect(choice.getByText(strictAccents ? 'Incorrect' : 'Correct', { exact: true })).toBeAttached();
        await expect(chosen).toHaveCSS('text-decoration-line', strictAccents ? 'line-through' : 'none');
        await expect(blanks.getByRole('textbox').nth(0)).toHaveAttribute('aria-invalid', 'true');
        await expect(blanks.getByRole('textbox').nth(1)).toHaveCSS(
          'text-decoration-line',
          strictAccents ? 'line-through' : 'none',
        );
        await expect(single.getByText(strictAccents ? 'Incorrect' : 'Correct', { exact: true })).toBeAttached();
        await expect(single.getByRole('textbox')).toHaveCSS(
          'text-decoration-line',
          strictAccents ? 'line-through' : 'none',
        );
      };
      await historicalMarks();
      await preference(!strictAccents);
      await openUnit(page, accentUnit.id, accentUnit.title);
      await historicalMarks();
      await page.reload();
      await historicalMarks();
      expect((await stored(page)).itemStates.every((state) => state.checked?.strictAccents === strictAccents)).toBe(
        true,
      );
      for (const theme of ['light', 'sepia', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await page.screenshot({ path: test.info().outputPath(`saved-accent-marks-${theme}.png`), fullPage: true });
      }
      const backup = await page.evaluate(async () => {
        const { exportData }: ReviewDb = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
        return JSON.stringify(await exportData());
      });
      const restore = async (data: string) => {
        await page.evaluate(async (json) => {
          const { importData }: ReviewDb = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
          await importData({ units: [], itemStates: [], attempts: [] });
          await importData(JSON.parse(json));
        }, data);
        await page.reload();
      };
      await restore(backup);
      await historicalMarks();
      const legacy = JSON.parse(backup);
      for (const state of legacy.itemStates) delete state.checked.strictAccents;
      await restore(JSON.stringify(legacy));
      await expect(choice.getByText(strictAccents ? 'Incorrect' : 'Correct', { exact: true })).toBeAttached();
      await expect(chosen).toHaveAttribute('aria-pressed', 'true');
      await expect(chosen).not.toHaveClass(/bg-ok|bg-bad|line-through/);
      for (const field of await blanks.getByRole('textbox').all()) {
        await expect(field).not.toHaveClass(/border-ok|border-bad|line-through/);
        await expect(field).not.toHaveAttribute('aria-invalid');
      }
      await expect(blanks.getByText('Incorrect', { exact: true })).toBeAttached();
      await expect(dialogue.getByText('a - Au revoir.', { exact: true }).first()).not.toHaveClass(
        /text-ok|text-bad|line-through/,
      );
      await expect(dialogue.getByText('Incorrect', { exact: true })).toBeAttached();
      await expect(single.getByRole('textbox')).toHaveCSS(
        'text-decoration-line',
        strictAccents ? 'line-through' : 'none',
      );
      for (const theme of ['light', 'sepia', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await page.screenshot({ path: test.info().outputPath(`legacy-neutral-slots-${theme}.png`), fullPage: true });
      }
    });
}
