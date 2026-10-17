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
