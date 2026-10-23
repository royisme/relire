/**
 * Reader basics: sentence playback stays in place; a word sheet belongs to the address that opened it;
 * the library fits a phone.
 */
import type { Page } from '@playwright/test';
import { expect, layout, openArticle, overflowing, test } from './fixtures';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A word answer whose entry the test can recognise, so the sheet shows which reply it drew. */
const wordAnswer = (word: string, translation: string) => ({
  word,
  lemma: word,
  partOfSpeech: 'nom',
  ipa: '',
  phoneticsGuide: '',
  translation,
  otherMeanings: [],
  contextTense: '',
  usageExamples: [],
  cefrLevel: 'A1',
  memoryTrick: '',
});

/** The first sentence of the opened article: its word 2 is "chose", its word 4 is "oubliée". */
const firstSentence = (page: Page) => page.locator('article [data-sentence]').first();

test('playing a sentence does not move the article', async ({ page, ai }) => {
  await openArticle(page);
  const before = await layout(page, 'article');
  await page.locator('article [data-sentence]').nth(1).hover();
  await page.locator('[data-sentence-actions] button').first().click();
  await expect.poll(() => ai.calls.tts).toBe(1);
  expect(await layout(page, 'article')).toEqual(before);
});

test('Back while a word lookup is loading takes its sheet away; a late answer cannot reopen it or replace the next lookup', async ({
  page,
  ai,
}) => {
  await openArticle(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let asked = 0;
  ai.answer({
    word: async () => {
      if (asked++ > 0) return wordAnswer('oubliée', 'forgotten');
      await gate;
      return wordAnswer('chose', 'thing');
    },
  });
  await firstSentence(page).locator('[data-reader-word="2"]').click();
  await expect(page.getByText('Looking up the word…')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/read$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A lookup started on the page the learner is on completes normally…
  await page.getByText('Le Petit Prince').first().click();
  await firstSentence(page).locator('[data-reader-word="4"]').click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'oubliée' })).toBeVisible();
  // …and the answer for the reader entry they left arrives too late to show anywhere.
  release();
  await pause(400);
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'oubliée' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'chose' })).toHaveCount(0);
  await expect(page).toHaveURL(/#\/read\/petit-prince$/);
});

test('a word lookup that fails after Back neither reopens the sheet nor leaves the new page for Settings', async ({
  page,
  ai,
}) => {
  await openArticle(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  ai.answer({
    word: async () => {
      await gate;
      throw new Error('late word failure');
    },
  });
  await firstSentence(page).locator('[data-reader-word="2"]').click();
  await expect(page.getByText('Looking up the word…')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/read$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  release();
  await pause(900);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/read$/);
});

test('library has no horizontal overflow @phone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Le Petit Prince').first()).toBeVisible();
  expect(await overflowing(page.locator('body'))).toEqual([]);
});
