/** Critical Words persistence, retry and book-cache contracts; invented data, no real providers. */
import { expect, test } from './fixtures';
import { mockConjugationDeviceVoice } from './deviceSpeech.helpers';
import { testBook } from '../tests/fixtures/vocabulary';
import {
  seed,
  stored,
  refuseWrites,
  holdVocabularyWrites,
  observeVocabularyTransactions,
  cacheFault,
  cacheRows,
} from './vocabulary.helpers';
import { VOCABULARY_REQUEST } from './contentService.helpers';
import { vocabularyPages } from '../scripts/vocabulary/publication';
type Storage = typeof import('../src/storage/vocabulary');
type Db = typeof import('../src/storage/db');
test('Words review commits introduction before answers, flips without writes, and persists explicit recall but not Skip', async ({
  page,
  ai,
}) => {
  await seed(page, 'en', 'light', 3);
  await page.getByRole('link', { name: 'Start / continue review' }).click();
  await expect(page.getByRole('heading', { name: 'test-a', exact: true })).toBeVisible();
  const backFace = page.locator('[data-vocabulary-face="back"]');
  const flip = page.locator('[data-vocabulary-face="front"] h1');
  await expect(backFace).toHaveCount(0);
  await expect(page.locator('[data-vocabulary-recall]')).toHaveCount(0);
  expect((await stored(page))[0].introducedAt).toBeNull();
  const release = await holdVocabularyWrites(page);
  try {
    await flip.click();
    await expect(page.locator('[data-vocabulary-face="front"] [data-vocabulary-flip]')).toBeDisabled();
    await expect(backFace).toHaveCount(0);
    await expect(page.locator('[data-vocabulary-recall]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('TEST meaning');
  } finally {
    await release();
  }
  await expect(backFace.locator('h2')).toBeVisible();
  const introduced = (await stored(page))[0];
  expect(introduced.introducedAt).not.toBeNull();
  expect(introduced.history).toHaveLength(0);
  const transactions = await observeVocabularyTransactions(page);
  for (let turn = 0; turn < 4; turn++) {
    await page.locator('[data-vocabulary-face="back"] h2').click();
    await flip.click();
  }
  expect(await transactions()).toBe(0);
  expect((await stored(page))[0]).toEqual(introduced);
  const snapshot = await page.evaluate(async () => {
    const storage: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    return storage.exportData();
  });
  expect(snapshot.vocabularyMeta.days.flatMap((day) => day.introducedKeys)).toEqual(['test-a']);
  await page.getByRole('button', { name: 'Forgot', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'test-b', exact: true })).toBeVisible();
  await flip.click();
  await page.getByRole('button', { name: 'Remembered', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'test-c', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Done for now / waiting' })).toBeVisible();
  const rows = await stored(page);
  expect(rows.map((row) => row.history.map((record) => record.rating))).toEqual([[1], [4], []]);
  expect(rows[2].introducedAt).toBeNull();
  expect(rows[2].schedule).toBeNull();
  for (const [index, row] of rows.slice(0, 2).entries()) {
    const record = row.history[0];
    expect(record.next).toEqual({
      phase: 'learning',
      step: index === 0 ? 0 : 1,
      dueAt: record.timestamp + (index === 0 ? 1 : 10) * 60_000,
      repetitions: 0,
      intervalDays: 0,
      easeFactor: 2.5,
    });
    expect(row.schedule).toEqual(record.next);
  }
  await page.getByRole('link', { name: 'Browse words' }).click();
  await page.reload();
  await expect(page.getByRole('table')).toBeVisible();
  expect(await stored(page)).toEqual(rows);
  expect(ai.calls.word + ai.calls.sentence + ai.calls.tts).toBe(0);
});

test('commit failure keeps front hidden; rating failure keeps answer/decision and storage-only retry advances once', async ({
  page,
  ai,
}) => {
  await seed(page);
  await page.goto('/#/study/words/review');
  await expect(page.getByRole('heading', { name: 'test-a' })).toBeVisible();
  const status = page.locator('[data-vocabulary-status]');
  const reason = 'TEST vocabulary disk refused. ' + 'Long TEST storage reason. '.repeat(80);
  await refuseWrites(page, true, reason);
  await page.locator('[data-vocabulary-face="front"] h1').click();
  await expect(page.locator('main')).not.toContainText('TEST meaning');
  expect((await stored(page))[0].introducedAt).toBeNull();
  await expect(status.getByText(reason, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View error details' }).click();
  await expect(page.getByRole('alert')).toHaveText(reason);
  await page.keyboard.press('Escape');
  await refuseWrites(page, false);
  await page.locator('[data-vocabulary-face="front"] h1').click();
  await expect(page.locator('[data-vocabulary-face="back"] h2')).toBeVisible();
  await refuseWrites(page, true);
  const good = page.getByRole('button', { name: 'Remembered', exact: true });
  await good.click();
  await expect(good).toHaveAttribute('aria-pressed', 'true');
  await expect(status).toContainText('TEST vocabulary disk refused');
  expect((await stored(page))[0].history).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Forgot', exact: true })).toBeDisabled();
  await expect(page.locator('main')).toContainText('TEST meaning test-a');
  await refuseWrites(page, false);
  await good.click();
  await expect(page.getByRole('heading', { name: 'test-b' })).toBeVisible();
  expect((await stored(page))[0].history).toHaveLength(1);
  const operations = await page.evaluate(() => (globalThis as { ratingOperations?: string[] }).ratingOperations);
  expect(operations).toHaveLength(2);
  expect(new Set(operations).size).toBe(1);
  expect(ai.calls.tts).toBe(0);
});
test('quota race and restore epoch never expose a stale answer or accept an old rating', async ({ page }) => {
  await seed(page);
  await page.goto('/#/study/words/review');
  await expect(page.getByRole('heading', { name: 'test-a' })).toBeVisible();
  await page.evaluate(async () => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/vocabulary.ts' as string);
    await storage.saveVocabularyPreferences(0);
  });
  await page.locator('[data-vocabulary-face="front"] h1').click();
  await expect(page.locator('main')).not.toContainText('TEST meaning');
  expect((await stored(page)).every((row) => row.introducedAt === null)).toBe(true);
  await expect(page.locator('[data-vocabulary-status]')).toContainText('Daily introduction allowance reached');
  await expect(page.getByText('Due now: 0 · New remaining today: 0', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/vocabulary.ts' as string);
    await storage.saveVocabularyPreferences(20);
  });
  await expect(page.getByRole('heading', { name: 'test-a' })).toBeVisible();
  await page.locator('[data-vocabulary-face="front"] h1').click();
  await expect(page.locator('[data-vocabulary-face="back"] h2')).toBeVisible();
  await page.evaluate(async () => {
    const storage: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const snapshot = await storage.exportData();
    await storage.importData(snapshot);
  });
  await expect(page.getByRole('button', { name: 'Flip card', exact: true })).toBeEnabled();
  await expect(page.locator('[data-vocabulary-face="back"] h2')).toHaveCount(0);
  await page.keyboard.press('2');
  expect((await stored(page))[0].history).toHaveLength(0);
  await page.locator('[data-vocabulary-face="front"] h1').click();
  await expect(page.locator('[data-vocabulary-face="back"] h2')).toBeVisible();
  await page.evaluate(async () => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/vocabulary.ts' as string);
    const snapshot = await storage.getVocabularySnapshot('test-a');
    await storage.resetVocabularySchedule('test-a', snapshot.tokens, Date.now());
  });
  await page.getByRole('button', { name: 'Remembered', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Flip card', exact: true })).toBeEnabled();
  await expect(page.locator('[data-vocabulary-face="back"]')).toHaveCount(0);
  expect((await stored(page))[0].history).toHaveLength(0);
});
for (const failure of ['partial', 'rate', 'hash', 'storage'] as const) {
  test(`complete-book ${failure} failure keeps the durable old cache; explicit restart/retry recovers from page0`, async ({
    page,
  }) => {
    const old = await testBook(1, 'OLD TEST'),
      next = await testBook(251, 'NEW TEST');
    await seed(page, 'en', 'light', 0, old);
    await expect(page.getByRole('button', { name: 'Check for updates', exact: true })).toBeEnabled();
    const beforeCache = await cacheRows(page);
    const status = page.locator('[data-vocabulary-download-status]');
    let failing = true;
    let release!: () => void;
    let held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: string[] = [];
    await page.route(VOCABULARY_REQUEST, async (route) => {
      const url = new URL(route.request().url());
      requests.push(url.pathname + url.search);
      const index = Number(url.searchParams.get('page'));
      expect([...url.searchParams.keys()].every((key) => ['page', 'version'].includes(key))).toBe(true);
      expect(url.searchParams.get('version')).toBe(index === 0 ? null : next.manifest.version);
      if (index === 1) await held;
      if (failing && failure === 'partial' && index === 1)
        return route.fulfill({ status: 410, json: { error: 'version-unavailable' } });
      if (failing && failure === 'rate' && index === 1)
        return route.fulfill({ status: 429, json: { error: 'rate-limited' } });
      const pages = vocabularyPages(structuredClone(next));
      // Keep the page schema valid so this exercises the aggregate hash, not an unrelated spelling error.
      if (failing && failure === 'hash' && index === 1) pages[1].entries[0].senses[0].gloss.en += ' CORRUPT TEST';
      return route.fulfill({ json: pages[index] });
    });
    const reason = {
      partial: 'HTTP 410: version-unavailable',
      rate: 'HTTP 429: rate-limited',
      hash: 'Vocabulary content hash mismatch',
      storage: 'TEST book cache refused',
    }[failure];
    const pinned = [
      '/v1/vocabulary/tcf-7000?page=0',
      `/v1/vocabulary/tcf-7000?page=1&version=${next.manifest.version}`,
    ];
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (failure === 'storage') await cacheFault(page, true);
        requests.length = 0;
        await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
        await expect.poll(() => requests.length).toBe(2);
        // Page0 is already received, but neither it nor a partial candidate may be persisted.
        expect(await cacheRows(page)).toEqual(beforeCache);
        release();
        await expect(status.getByText(reason, { exact: true })).toBeVisible();
        await expect(page.getByText('1 word available offline', { exact: true })).toBeVisible();
        expect(requests).toEqual(pinned);
        expect(await cacheRows(page)).toEqual(beforeCache);
        await page.getByRole('button', { name: 'View error details' }).click();
        await expect(page.getByRole('alert')).toHaveText(reason);
        await page.keyboard.press('Escape');
        await cacheFault(page, false);
        if (attempt === 0) {
          await page.getByRole('link', { name: 'All words', exact: true }).click();
          await expect(page.getByRole('button', { name: 'test-0', exact: true })).toBeVisible();
          await expect(page.getByRole('row')).toHaveCount(2);
          await page.reload();
          await expect(page.getByRole('row')).toHaveCount(2);
          expect(await cacheRows(page)).toEqual(beforeCache);
          await page.getByRole('link', { name: 'Today', exact: true }).click();
          held = new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      }
      failing = false;
      requests.length = 0;
      await page
        .getByRole('button', { name: failure === 'partial' ? 'Restart download' : 'Check for updates', exact: true })
        .click();
      await expect(page.getByText('251 words available offline', { exact: true })).toBeVisible();
      expect(requests).toEqual(pinned);
      expect(
        await page.evaluate(async () => {
          const cache = await import(/* @vite-ignore */ '/src/storage/vocabularyBook.ts' as string);
          return cache.getVocabularyBook();
        }),
      ).toEqual(next);
      expect((await cacheRows(page)).map((row) => row.key)).toEqual(beforeCache.map((row) => row.key));
      await page.reload();
      await expect(page.getByText('251 words available offline', { exact: true })).toBeVisible();
    } finally {
      release();
      await cacheFault(page, false);
    }
  });
}

test('explicit Listen uses the selected device engine and session speech stops on moving/leaving, without introduction', async ({
  page,
  ai,
}) => {
  await mockConjugationDeviceVoice(page);
  await seed(page);
  await page.evaluate(async () => {
    const settings = await import(/* @vite-ignore */ '/src/utils/appSettings.ts' as string);
    settings.saveAppSettings({
      ...settings.getAppSettings(),
      speechProvider: 'device',
      speechModel: '',
      speechVoice: '',
    });
  });
  await page.getByRole('link', { name: 'Start / continue review' }).click();
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.deviceSpeechTest.spoken)).toEqual(['test-a']);
  await expect(page.locator('[data-vocabulary-card]')).toHaveAttribute('data-face', 'front');
  await expect(page.locator('[data-vocabulary-face="back"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'test-b', exact: true })).toBeVisible();
  const phase = () =>
    page.evaluate(async () => {
      const speech = await import(/* @vite-ignore */ '/src/utils/speech/index.ts' as string);
      return speech.getSpeechState().phase;
    });
  await expect.poll(phase).toBe('idle');
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect.poll(phase).toBe('playing');
  await page.getByRole('link', { name: 'Back to Words' }).click();
  await expect.poll(phase).toBe('idle');
  expect((await stored(page)).every((row) => row.introducedAt === null)).toBe(true);
  expect(ai.calls.word + ai.calls.tts).toBe(0);
});

test('7000 synthetic entries paginate at50; unseen fronts create no row and no-key saved snapshots reveal offline', async ({
  page,
  ai,
}) => {
  const book = await testBook(7000);
  await seed(page, 'en', 'light', 0, book);
  await page.getByRole('link', { name: 'All words', exact: true }).click();
  await expect(page.getByRole('row')).toHaveCount(51);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'test-50', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('test-6999');
  await expect(page.getByRole('row')).toHaveCount(2);
  expect(await stored(page)).toEqual([]);
  await page.getByRole('link', { name: 'Review due words' }).click();
  await expect(page.getByRole('heading', { name: 'test-0', exact: true })).toBeVisible();
  expect(await stored(page)).toEqual([]);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'test-1', exact: true })).toBeVisible();
  expect(await stored(page)).toEqual([]);
  await page.locator('[data-vocabulary-face="front"] h1').click();
  await expect(page.locator('[data-vocabulary-face="back"] h2')).toBeVisible();
  expect((await stored(page))[0].key).toBe('test-1');
  await page.getByRole('link', { name: 'Back to Words' }).click();
  await page.context().setOffline(true);
  await page.getByRole('link', { name: 'Start / continue review' }).click();
  await page.locator('[data-vocabulary-face="front"] h1').click();
  await expect(page.locator('main')).toContainText('TEST meaning test-1');
  await page.evaluate(async () => {
    const locale = await import(/* @vite-ignore */ '/src/i18n/index.ts' as string);
    locale.setAppLanguage('zh');
  });
  await expect(page.locator('[data-vocabulary-face="back"] h2')).toHaveText('test-1');
  await expect(page.locator('[data-vocabulary-face="back"]')).toContainText('test-1');
  expect(ai.calls.word + ai.calls.tts).toBe(0);
});
