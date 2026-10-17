/** Vocabulary session/history and confirmed deletion flows; no real AI or speech requests. */
import type { Page } from '@playwright/test';
import type { VocabWord } from '../src/types';
import { calculateNextReview } from '../src/utils/srs';
import { expect, overflowing, test } from './fixtures';
import { waitForArticle } from './practice.helpers';

type Db = typeof import('../src/storage/db');
const WORDS = '/#/study/words';
const searchName = 'Search words, meanings or sentences';
const seeds: VocabWord[] = ['alpha', 'bravo', 'charlie'].map((word, index) => ({
  id: word,
  word,
  lemma: word,
  ipa: '',
  translation: `Meaning of ${word}`,
  partOfSpeech: 'nom',
  contextSentence: 'Une phrase assez longue pour vérifier la lecture et les commandes sur un petit écran.',
  addedAt: '2000-01-01',
  repetitions: index,
  intervalDays: index === 2 ? 6 : 1,
  easeFactor: 2.5,
  nextReviewDate: '2000-01-01',
  reviewHistory: Array.from({ length: index }, () => ({
    date: '2000-01-01',
    rating: 4,
    intervalDays: 1,
    easeFactor: 2.5,
  })),
}));

async function seedVocabulary(page: Page) {
  await page.addInitScript(() => localStorage.setItem('relire_lang', 'en'));
  await page.goto('/#/read');
  await waitForArticle(page);
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await page.evaluate(async (words) => {
    const { saveVocab }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    // Flush App's initial snapshot before replacing it with this spec's words.
    window.dispatchEvent(new Event('pagehide'));
    await saveVocab(words);
  }, seeds);
  await page.goto(WORDS);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Review 3 due', exact: true })).toBeVisible();
}

function storedVocabulary(page: Page) {
  return page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    return (await db()).getAll('vocab');
  });
}

const card = (page: Page) => page.locator('[role="button"][aria-expanded]');
const savedWord = (page: Page, word: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: word, exact: true }) });
const after = (days: number) => `In ${days} ${days === 1 ? 'day' : 'days'}`;

for (const phone of [false, true]) {
  const suffix = phone ? ' @phone' : '';

  test(`three due words stay in order with a stable total, scheduler previews and persisted history${suffix}`, async ({
    page,
    ai,
  }) => {
    void ai;
    await seedVocabulary(page);
    await page.getByRole('button', { name: 'Review 3 due', exact: true }).click();
    for (const [index, word] of seeds.entries()) {
      await expect(card(page).getByRole('heading', { name: word.word, exact: true })).toBeVisible();
      await expect(page.getByText(`${index + 1} / 3`, { exact: true })).toBeVisible();
      await expect(page.getByText(`${index} reviewed`, { exact: true })).toBeVisible();
      const progress = page.getByRole('progressbar', { name: 'Review' });
      await expect(progress).toHaveAttribute('aria-valuemax', '3');
      await expect(progress).toHaveAttribute('aria-valuenow', String(index));
      await card(page).focus();
      await page.keyboard.press(index === 1 ? 'Space' : 'Enter');
      await expect(card(page)).toHaveAttribute('aria-expanded', 'true');
      for (const [rating, label] of [
        [1, 'Hard'],
        [3, 'Good'],
        [4, 'Easy'],
        [5, 'Mastered'],
      ] as const) {
        const scheduled = calculateNextReview(word, rating);
        await expect(
          page.getByRole('button', { name: `${label} ${after(scheduled.intervalDays)}`, exact: true }),
        ).toBeVisible();
      }
      expect(await overflowing(page.locator('main'))).toEqual([]);
      const expected = calculateNextReview(word, 4);
      await page.getByRole('button', { name: `Easy ${after(expected.intervalDays)}`, exact: true }).click();
      await expect
        .poll(async () => (await storedVocabulary(page)).find((item) => item.id === word.id)?.reviewHistory.length)
        .toBe(word.reviewHistory.length + 1);
      const stored = (await storedVocabulary(page)).find((item) => item.id === word.id)!;
      expect(stored.reviewHistory).toEqual(expected.reviewHistory);
      expect(stored.intervalDays).toBe(expected.intervalDays);
      expect(stored.nextReviewDate).toBe(expected.nextReviewDate);
      expect(stored.repetitions).toBe(expected.repetitions);
      expect(stored.lastReviewedAt).toBeTruthy();
    }
    await expect(page.getByRole('heading', { name: 'Done for now' })).toBeVisible();
    await expect(page.getByText('3 reviewed', { exact: true })).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(page.getByText('Nothing due today', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Review \d+ due$/ })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Nothing due today', { exact: true })).toBeVisible();
    expect((await storedVocabulary(page)).map((word) => word.reviewHistory.length)).toEqual([1, 2, 3]);
  });

  test(`cancel and Escape keep the word and history; keyboard confirmation deletes only its named target${suffix}`, async ({
    page,
    ai,
  }) => {
    void ai;
    await seedVocabulary(page);
    const original = await storedVocabulary(page);
    const opener = savedWord(page, 'bravo').getByRole('button', { name: 'Delete: bravo', exact: true });
    for (const control of [opener, savedWord(page, 'bravo').getByRole('button', { name: 'Listen', exact: true })]) {
      const box = await control.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(40);
      expect(box!.height).toBeGreaterThanOrEqual(40);
    }
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Delete saved word' });
    await expect(dialog).toContainText('Delete “bravo” and its review history from your vocabulary?');
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    const confirm = dialog.getByRole('button', { name: 'Delete', exact: true });
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await storedVocabulary(page)).toEqual(original);
    await opener.click();
    await cancel.click();
    await expect(dialog).toHaveCount(0);
    expect(await storedVocabulary(page)).toEqual(original);
    await opener.click();
    expect(await overflowing(dialog)).toEqual([]);
    await page.keyboard.press('Tab');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(savedWord(page, 'bravo')).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: searchName })).toBeFocused();
    await expect.poll(() => storedVocabulary(page)).toEqual(original.filter((word) => word.id !== 'bravo'));
    await page.reload();
    await expect(savedWord(page, 'bravo')).toHaveCount(0);
    await expect(savedWord(page, 'alpha')).toBeVisible();
    await expect(savedWord(page, 'charlie')).toBeVisible();
    expect(await overflowing(page.locator('main'))).toEqual([]);
  });
}

test('leaving a partial review and starting again resets progress and queues only remaining due words', async ({
  page,
  ai,
}) => {
  void ai;
  await seedVocabulary(page);
  await page.getByRole('button', { name: 'Review 3 due', exact: true }).click();
  await card(page).press('Enter');
  await page.getByRole('button', { name: 'Easy In 1 day', exact: true }).click();
  await expect(card(page).getByRole('heading', { name: 'bravo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to list' }).click();
  await page.getByRole('button', { name: 'Review 2 due', exact: true }).click();
  await expect(card(page).getByRole('heading', { name: 'bravo', exact: true })).toBeVisible();
  await expect(card(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('1 / 2', { exact: true })).toBeVisible();
  await expect(page.getByText('0 reviewed', { exact: true })).toBeVisible();
  for (const days of [6, 15]) {
    await card(page).press('Enter');
    await page.getByRole('button', { name: `Easy ${after(days)}`, exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Done for now' })).toBeVisible();
  await expect(page.getByText('2 reviewed', { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await storedVocabulary(page)).map((word) => word.reviewHistory.length))
    .toEqual([1, 2, 3]);
});

for (const theme of ['light', 'sepia', 'dark']) {
  test(`unmatched vocabulary search stays distinct from an empty library in ${theme} @phone`, async ({ page, ai }) => {
    void ai;
    await page.addInitScript((value) => localStorage.setItem('relire_theme', value), theme);
    await seedVocabulary(page);
    await page.getByRole('searchbox', { name: searchName }).fill('no matching word');
    await expect(page.getByText('No words match your search or filter.', { exact: true })).toBeVisible();
    await expect(page.getByText(/No saved words yet/)).toHaveCount(0);
    expect(await overflowing(page.locator('main'))).toEqual([]);
    await page.getByRole('searchbox', { name: searchName }).fill('');
    for (const word of seeds) {
      await savedWord(page, word.word)
        .getByRole('button', { name: `Delete: ${word.word}`, exact: true })
        .click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    }
    await expect(
      page.getByText('No saved words yet. While reading, tap a word and choose Save word.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('No words match your search or filter.', { exact: true })).toHaveCount(0);
  });
}
