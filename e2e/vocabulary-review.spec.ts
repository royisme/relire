/** Integrated Words routes/reveal/durability/keyboard/book-cache contracts; invented data, no real providers. Lead runs. */
import { expect, overflowing, settled, test } from './fixtures';
import { mockConjugationDeviceVoice } from './deviceSpeech.helpers';
import { testBook } from '../tests/fixtures/vocabulary';
import {
  seed,
  stored,
  refuseWrites,
  holdVocabularyWrites,
  observeVocabularyTransactions,
  reviewGeometry,
  cacheFault,
  cacheRows,
} from './vocabulary.helpers';
import { VOCABULARY_REQUEST } from './contentService.helpers';
import { vocabularyPages } from '../scripts/vocabulary/publication';
type Storage = typeof import('../src/storage/vocabulary');
type Db = typeof import('../src/storage/db');
const labels = {
  en: {
    reveal: 'Flip card',
    front: 'Flip to front',
    answer: 'Answer',
    skip: 'Skip for now',
    all: 'All words',
    today: 'Today',
    start: 'Start / continue review',
    back: 'Back to Words',
    browse: 'Browse words',
    good: 'Remembered',
    error: 'View error details',
  },
  zh: {
    reveal: '翻转卡片',
    front: '翻回正面',
    answer: '答案',
    skip: '暂时跳过',
    all: '全部词汇',
    today: '今天',
    start: '开始或继续复习',
    back: '返回词汇',
    browse: '浏览词汇',
    good: '记得',
    error: '查看错误详情',
  },
};
for (const phone of [false, true])
  for (const language of ['en', 'zh'] as const)
    for (const theme of ['light', 'sepia', 'dark']) {
      test(`Words two-way flip has no pre-reveal rating dashboard ${language} ${theme}${phone ? ' @phone' : ''}`, async ({
        page,
        ai,
      }) => {
        await seed(page, language, theme);
        const text = labels[language];
        await expect(page.getByRole('link', { name: text.today, exact: true })).toHaveAttribute('aria-current', 'page');
        const status = page.locator('[data-vocabulary-download-status]');
        const statusBox = await status.boundingBox();
        await page.getByRole('link', { name: text.all, exact: true }).click();
        await expect(page).toHaveURL(/#\/study\/words\/all$/);
        await expect(page.getByRole('link', { name: text.all, exact: true })).toHaveAttribute('aria-current', 'page');
        await expect(page.getByRole('table')).toBeVisible();
        if (!phone)
          await expect(
            page.locator('aside').getByRole('link', { name: language === 'en' ? 'Words' : '生词', exact: true }),
          ).toHaveAttribute('aria-current', 'page');
        else {
          await page.getByRole('button', { name: language === 'en' ? 'Menu' : '菜单', exact: true }).click();
          await expect(
            page.getByRole('dialog').getByRole('link', { name: language === 'en' ? 'Words' : '生词', exact: true }),
          ).toHaveAttribute('aria-current', 'page');
          await page.keyboard.press('Escape');
        }
        await page.getByRole('link', { name: text.today, exact: true }).click();
        expect((await status.boundingBox())?.height).toBe(statusBox?.height);
        await page.getByRole('link', { name: text.start }).click();
        await expect(page).toHaveURL(/#\/study\/words\/review$/);
        await expect(page.getByRole('heading', { name: 'test-a', exact: true })).toBeVisible();
        await expect(page.locator('main')).not.toContainText('TEST meaning');
        await expect(page.locator('main')).not.toContainText('nom TEST');
        await expect(page.locator('main')).not.toContainText('Une phrase');
        await expect(page.locator('main [aria-label*="TEST meaning"], main [title*="TEST meaning"]')).toHaveCount(0);
        const card = page.locator('[data-vocabulary-card]');
        const backFace = page.locator('[data-vocabulary-face="back"]');
        await expect(backFace).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^(Again|Hard|Good|Easy)(\s|$)/ })).toHaveCount(0);
        await expect(page.locator('[data-vocabulary-recall]')).toHaveCount(0);
        const before = await card.boundingBox();
        const reveal = page.getByRole('button', { name: text.reveal, exact: true });
        await expect(reveal).toHaveCount(1);
        await page.keyboard.press('1');
        await page.keyboard.press('2');
        expect((await stored(page))[0].history).toHaveLength(0);
        await reveal.focus();
        await reveal.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
        expect((await stored(page))[0].introducedAt).toBeNull();
        await page.keyboard.down('Enter');
        await expect(page.getByRole('heading', { name: text.answer, exact: true })).toBeFocused();
        await page.locator('[data-vocabulary-face="front"] [data-vocabulary-flip]').dispatchEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          repeat: true,
        });
        await page.keyboard.up('Enter');
        expect((await stored(page))[0].history).toHaveLength(0);
        expect((await stored(page))[0].introducedAt).not.toBeNull();
        await expect(card).toHaveAttribute('data-face', 'back');
        await expect(page.locator('[data-vocabulary-face="front"]')).toHaveAttribute('inert', '');
        await settled(page);
        expect((await card.boundingBox())?.y).toBe(before?.y);
        const turn = await page.locator('.vocabulary-flashcard-turn').evaluate((element) => ({
          transform: getComputedStyle(element).transform,
          transition: getComputedStyle(element).transitionDuration,
        }));
        expect(turn.transform).not.toBe('none');
        expect(turn.transition).toBe('0.18s');
        const transactions = await observeVocabularyTransactions(page);
        for (let flip = 0; flip < 4; flip++) {
          await page.getByRole('button', { name: text.front, exact: true }).click();
          await expect(reveal).toBeFocused();
          await expect(backFace).toHaveAttribute('aria-hidden', 'true');
          await expect(backFace).toHaveAttribute('inert', '');
          await expect(page.getByRole('heading', { name: text.answer, exact: true })).toHaveCount(0);
          await expect(page.locator('[data-vocabulary-recall]')).toHaveCount(0);
          await page.keyboard.press('2');
          await reveal.click();
          await expect(page.getByRole('heading', { name: text.answer, exact: true })).toBeFocused();
        }
        expect(await transactions()).toBe(0);
        expect((await stored(page))[0].history).toHaveLength(0);
        const snapshot = await page.evaluate(async () => {
          const storage: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
          return storage.exportData();
        });
        expect(snapshot.vocabularyMeta.days.flatMap((day) => day.introducedKeys)).toEqual(['test-a']);
        await settled(page);
        expect(await overflowing(page.locator('main'))).toEqual([]);
        await expect(backFace).toContainText('Une phrase TEST 1.');
        expect(await backFace.evaluate((face) => face.scrollHeight <= face.clientHeight + 1)).toBe(true);
        await page.keyboard.press('3');
        expect((await stored(page))[0].history).toHaveLength(0);
        await page.keyboard.press('1');
        await expect(page.getByRole('heading', { name: 'test-b', exact: true })).toBeVisible();
        await expect(reveal).toBeFocused();
        await page.keyboard.down('Space');
        await page.keyboard.up('Space');
        await expect(page.getByRole('heading', { name: text.answer, exact: true })).toBeFocused();
        if (language === 'en') await page.keyboard.press('2');
        else await page.getByRole('button', { name: text.good, exact: true }).click();
        await expect(
          page.getByRole('heading', { name: language === 'en' ? 'Done for now / waiting' : '暂告一段落，等待复习' }),
        ).toBeFocused();
        const rows = await stored(page);
        expect(rows.map((row) => row.history.map((record) => record.rating))).toEqual([[1], [4]]);
        for (const [index, row] of rows.entries()) {
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
        expect(await overflowing(page.locator('main'))).toEqual([]);
        await page.getByRole('link', { name: text.browse }).click();
        await expect(page).toHaveURL(/#\/study\/words\/all$/);
        expect(ai.calls.word + ai.calls.sentence + ai.calls.tts).toBe(0);
      });
    }
test('first flip waits for IndexedDB; reduced motion and held keys never flip-and-grade or reach the next word', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await page.goto('/#/study/words/review');
  const flip = page.getByRole('button', { name: 'Flip card', exact: true });
  await expect(flip).toBeFocused();
  await settled(page);
  const before = await reviewGeometry(page);
  const release = await holdVocabularyWrites(page);
  try {
    await page.keyboard.down('Enter');
    await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
    await expect(page.locator('[data-vocabulary-face="back"]')).toHaveCount(0);
    expect(await reviewGeometry(page)).toEqual(before);
  } finally {
    await release();
  }
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toBeFocused();
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  expect((await stored(page))[0].history).toHaveLength(0);
  const front = page.getByRole('button', { name: 'Flip to front', exact: true });
  await front.focus();
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(flip).toBeFocused();
  await page.keyboard.press('2');
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toBeFocused();
  expect(
    await page.locator('.vocabulary-flashcard-turn').evaluate((turn) => ({
      transform: getComputedStyle(turn).transform,
      transition: getComputedStyle(turn).transitionDuration,
    })),
  ).toEqual({ transform: 'none', transition: '0s' });
  await front.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229 });
  await expect(page.locator('[data-vocabulary-card]')).toHaveAttribute('data-face', 'back');
  const remembered = page.getByRole('button', { name: 'Remembered', exact: true });
  await remembered.focus();
  await page.keyboard.down('Enter');
  await expect(flip).toBeFocused();
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(page.getByRole('heading', { name: 'test-b', exact: true })).toBeVisible();
  expect((await stored(page)).map((row) => row.history.length)).toEqual([1, 0]);
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  expect((await stored(page))[1].introducedAt).toBeNull();
});

test('commit failure keeps front hidden; rating failure keeps answer/decision and storage-only retry advances once', async ({
  page,
  ai,
}) => {
  await seed(page);
  await page.goto('/#/study/words/review');
  await expect(page.getByRole('heading', { name: 'test-a' })).toBeVisible();
  const status = page.locator('[data-vocabulary-status]');
  await settled(page);
  const beforeFailure = await reviewGeometry(page);
  const reason = 'TEST vocabulary disk refused. ' + 'Long TEST storage reason. '.repeat(80);
  await refuseWrites(page, true, reason);
  await page.getByRole('button', { name: 'Flip card', exact: true }).click();
  await expect(page.locator('main')).not.toContainText('TEST meaning');
  expect((await stored(page))[0].introducedAt).toBeNull();
  await expect(status.getByText(reason, { exact: true })).toBeVisible();
  expect(await reviewGeometry(page)).toEqual(beforeFailure);
  await expect(page.getByRole('button', { name: 'Flip card', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'View error details' }).click();
  await expect(page.getByRole('alert')).toHaveText(reason);
  await page.keyboard.press('Escape');
  await refuseWrites(page, false);
  await page.getByRole('button', { name: 'Flip card', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toBeVisible();
  await refuseWrites(page, true);
  await settled(page);
  const backGeometry = await reviewGeometry(page);
  const good = page.getByRole('button', { name: 'Remembered', exact: true });
  await good.click();
  await expect(good).toHaveAttribute('aria-pressed', 'true');
  await expect(good).toBeFocused();
  await expect(status).toContainText('TEST vocabulary disk refused');
  expect(await reviewGeometry(page)).toEqual(backGeometry);
  await page.getByRole('button', { name: 'View error details' }).click();
  await page.keyboard.press('2');
  await page.getByRole('button', { name: 'Flip to front', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-vocabulary-card]')).toHaveAttribute('data-face', 'back');
  expect((await stored(page))[0].history).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'View error details' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Forgot', exact: true })).toBeDisabled();
  await page.getByRole('heading', { name: 'Answer', exact: true }).focus();
  await page.keyboard.press('1');
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
  await page.getByRole('button', { name: 'Flip card', exact: true }).click();
  await expect(page.locator('main')).not.toContainText('TEST meaning');
  expect((await stored(page)).every((row) => row.introducedAt === null)).toBe(true);
  await expect(page.locator('[data-vocabulary-status]')).toContainText('Daily introduction allowance reached');
  await expect(page.getByText('Due now: 0 · New remaining today: 0', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/vocabulary.ts' as string);
    await storage.saveVocabularyPreferences(20);
  });
  await expect(page.getByRole('heading', { name: 'test-a' })).toBeVisible();
  await page.getByRole('button', { name: 'Flip card', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const storage: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const snapshot = await storage.exportData();
    await storage.importData(snapshot);
  });
  await expect(page.getByRole('button', { name: 'Flip card', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toHaveCount(0);
  await page.keyboard.press('2');
  expect((await stored(page))[0].history).toHaveLength(0);
  await page.getByRole('button', { name: 'Flip card', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toBeFocused();
  await page.evaluate(async () => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/vocabulary.ts' as string);
    const snapshot = await storage.getVocabularySnapshot('test-a');
    await storage.resetVocabularySchedule('test-a', snapshot.tokens, Date.now());
  });
  await page.getByRole('button', { name: 'Remembered', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Flip card', exact: true })).toBeFocused();
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
    await settled(page);
    const status = page.locator('[data-vocabulary-download-status]');
    const beforeSlot = await status.boundingBox();
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
        expect((await status.boundingBox())?.height).toBe(beforeSlot?.height);
        expect((await status.boundingBox())?.y).toBe(beforeSlot?.y);
        await expect(page.getByText('1 word available offline', { exact: true })).toBeVisible();
        expect(requests).toEqual(pinned);
        expect(await cacheRows(page)).toEqual(beforeCache);
        await page.getByRole('button', { name: 'View error details' }).click();
        await expect(page.getByRole('alert')).toHaveText(reason);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'View error details' })).toBeFocused();
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
  await page.getByRole('button', { name: 'Flip card', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toBeVisible();
  expect((await stored(page))[0].key).toBe('test-1');
  await page.getByRole('link', { name: 'Back to Words' }).click();
  await page.context().setOffline(true);
  await page.getByRole('link', { name: 'Start / continue review' }).click();
  await page.getByRole('button', { name: 'Flip card', exact: true }).click();
  await expect(page.locator('main')).toContainText('TEST meaning test-1');
  await page.evaluate(async () => {
    const locale = await import(/* @vite-ignore */ '/src/i18n/index.ts' as string);
    locale.setAppLanguage('zh');
  });
  await expect(page.getByRole('heading', { name: '答案', exact: true })).toBeFocused();
  await expect(page.locator('[data-vocabulary-face="back"]')).toContainText('test-1');
  expect(ai.calls.word + ai.calls.tts).toBe(0);
});
