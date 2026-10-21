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
    const lookup = { ...testLookup(row.word), sentence: `Une phrase ${row.word}. ${'Long TEST context. '.repeat(60)}` };
    return {
      ...row,
      bookSource: {
        ...row.bookSource!,
        senses: [0, 1].map((sense) => ({
          pos: 'nom TEST',
          gloss: { en: `TEST sense ${sense}. ${'Long TEST sense. '.repeat(40)}`, zh: `\u6d4b\u8bd5 ${sense}` },
          examples: [{ fr: `Une phrase TEST ${sense}.`, en: 'TEST example.', zh: '\u6d4b\u8bd5' }],
        })),
      },
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
      await storage.importData({
        vocab,
        vocabularyMeta: {
          schedulerPolicy: 'fsrs6/ts-fsrs@5.4.2/policy1',
          preferences: { newPerDay: 20, retentionPercent: 90 },
          days: [],
        },
      });
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
export async function refuseWrites(page: Page, refuse: boolean, reason = 'TEST vocabulary disk refused') {
  await page.evaluate(
    ({ refuse, reason }) => {
      const globals = globalThis as {
        vocabularyRefuses?: boolean;
        vocabularyPatched?: boolean;
        vocabularyReason?: string;
        ratingOperations?: string[];
      };
      globals.vocabularyRefuses = refuse;
      globals.vocabularyReason = reason;
      if (globals.vocabularyPatched) return;
      globals.vocabularyPatched = true;
      globals.ratingOperations = [];
      // oxlint-disable-next-line typescript/unbound-method -- Delegate with the active native store.
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === 'vocab' && value.history?.length)
          globals.ratingOperations!.push(value.history.at(-1).operationId);
        if (globals.vocabularyRefuses && (this.name === 'vocab' || this.name === 'meta'))
          throw new Error(globals.vocabularyReason);
        return put.call(this, value, key);
      };
    },
    { refuse, reason },
  );
}
/** Hold a real IndexedDB write lock, so a reveal cannot finish until explicitly released. */
export async function holdVocabularyWrites(page: Page) {
  await page.evaluate(async () => {
    const storage: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const globals = globalThis as { releaseVocabularyWrite?: () => Promise<void> };
    const tx = (await storage.db()).transaction(['vocab', 'meta'], 'readwrite');
    let held = true;
    globals.releaseVocabularyWrite = async () => {
      held = false;
      await tx.done;
    };
    const keepAlive = async () => {
      while (held) await tx.objectStore('meta').get('vocabularyEpoch');
    };
    void keepAlive();
  });
  return () =>
    page.evaluate(async () => {
      await (globalThis as { releaseVocabularyWrite?: () => Promise<void> }).releaseVocabularyWrite?.();
    });
}
/** Count reads as well as writes while testing display-only flips. */
export async function observeVocabularyTransactions(page: Page) {
  await page.evaluate(() => {
    const globals = globalThis as { vocabularyTransactions?: number };
    globals.vocabularyTransactions = 0;
    // oxlint-disable-next-line typescript/unbound-method -- Native transaction keeps its receiver.
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
      const names = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
      if (names.some((name) => name === 'vocab' || name === 'meta')) globals.vocabularyTransactions!++;
      return transaction.apply(this, args);
    };
  });
  return () => page.evaluate(() => (globalThis as { vocabularyTransactions?: number }).vocabularyTransactions);
}
export async function cacheFault(page: Page, refuse: boolean) {
  await page.evaluate((refuse) => {
    const globals = globalThis as { restoreVocabularyCache?: () => void };
    globals.restoreVocabularyCache?.();
    delete globals.restoreVocabularyCache;
    if (!refuse) return;
    // oxlint-disable-next-line typescript/unbound-method -- Restored after the update, including on assertion failure.
    const put = IDBObjectStore.prototype.put;
    globals.restoreVocabularyCache = () => {
      IDBObjectStore.prototype.put = put;
    };
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'cache' && value.key === 'content:vocabulary:tcf-7000')
        throw new Error('TEST book cache refused');
      return put.call(this, value, key);
    };
  }, refuse);
}
export const cacheRows = (page: Page) =>
  page.evaluate(async () => {
    const storage: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    return (await storage.db()).getAll('cache');
  });
export const stored = (page: Page) =>
  page.evaluate(async () => {
    const storage: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    return (await storage.db()).getAll('vocab');
  });
