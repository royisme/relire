/** Disposable personal cards and optional complete cache, installed before entering Words. */
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { VOCABULARY_REQUEST } from './contentService.helpers';
import { testRow, testLookup, testAnalysis } from '../tests/fixtures/vocabulary';
import { vocabularyContextKey } from '../src/services/vocabulary/identity';
import type { VocabularyBook } from '../src/types/vocabulary';
type Db = typeof import('../src/storage/db');
export async function seed(page: Page, language = 'en', theme = 'light', count = 2, book?: VocabularyBook) {
  await page.addInitScript(
    ({ language, theme }) => {
      localStorage.setItem('relire_lang', language);
      localStorage.setItem('relire_theme', theme);
      localStorage.setItem('relire_onboarded', '1');
      localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {} }));
    },
    { language, theme },
  );
  // Intentional service-unavailable responses here keep the personal-card queue independent of the book.
  await page.route(VOCABULARY_REQUEST, (route) => route.fulfill({ status: 404, json: { error: 'book-unavailable' } }));
  await page.goto('/#/read');
  await expect(page.locator('main')).toBeVisible();
  const rows = Array.from({ length: count }, (_, i) => {
    const row = testRow(`test-${String.fromCharCode(97 + i)}`);
    const lookup = testLookup(row.word);
    return {
      ...row,
      bookmarked: true,
      bookmarkedAt: i + 1,
      contexts: [
        {
          id: vocabularyContextKey(lookup),
          sentence: lookup.sentence,
          savedAt: 1,
          requestLanguage: lookup.requestLanguage,
          analysis: {
            ...testAnalysis(row.word),
            translation: `TEST meaning ${row.word}. ${'Long TEST definition. '.repeat(100)}`,
            usageExamples: [
              { fr: 'anticonstitutionnellement'.repeat(12), en: 'Long TEST example.', zh: '\u6d4b\u8bd5' },
            ],
          },
        },
      ],
    };
  });
  await page.evaluate(
    async ({ vocab, book }) => {
      const storage: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
      await storage.importData({ vocab, vocabularyMeta: { preferences: { newPerDay: 20 }, days: [] } });
      if (book) {
        const cache = await import(/* @vite-ignore */ '/src/storage/vocabularyBook.ts' as string);
        await cache.putVocabularyBook(book);
      }
    },
    { vocab: rows, book },
  );
  await page.goto('/#/study/words');
  return rows;
}
export const stored = (page: Page) =>
  page.evaluate(async () => {
    const storage: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    return (await storage.db()).getAll('vocab');
  });
