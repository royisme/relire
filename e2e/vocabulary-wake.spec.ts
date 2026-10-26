/** Deterministic quota continuation and true read-error retry; no reloads or real-minute sleeps. Lead runs. */
import { expect, test } from './fixtures';
import { seed, stored } from './vocabulary.helpers';
type Storage = typeof import('../src/storage/vocabulary');
type Db = typeof import('../src/storage/db');

for (const future of [false, true]) {
  test(`quota race automatically selects the ${future ? 'future minute' : 'available'} due card without exposing the losing answer`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(2026, 9, 20, 12) });
    await page.clock.pauseAt(new Date(2026, 9, 20, 12, 0, 1));
    await seed(page);
    await page.goto('/#/words/review');
    await expect(page.getByRole('heading', { name: 'test-a', exact: true })).toBeVisible();
    await page.evaluate(async (future) => {
      const storage: Storage = await import(/* @vite-ignore */ '/src/storage/vocabulary.ts' as string);
      await storage.saveVocabularyPreferences({ newPerDay: 1, retentionPercent: 90, studyBook: 'mine' });
      const snapshot = await storage.getVocabularySnapshot('test-b');
      const result = await storage.introduceVocabularyCard(
        { key: 'test-b', word: 'test-b' },
        snapshot.tokens,
        Date.now(),
      );
      if (future)
        await storage.rateVocabularyCard('test-b', result.tokens, 'TEST other-tab Again', 'forgot', Date.now());
    }, future);
    await page.locator('[data-vocabulary-face="front"] h1').click();
    await expect(page.locator('[data-vocabulary-status]')).toContainText('You have reached today’s limit of new words');
    await expect(page.locator('main')).not.toContainText('TEST meaning');
    expect((await stored(page)).find((row) => row.key === 'test-a')!.introducedAt).toBeNull();
    if (future) {
      await expect(page.getByRole('heading', { name: 'Nothing more for now' })).toBeFocused();
      await expect(page.getByText(/Your next word is ready at/)).toContainText('60 seconds');
      await page.clock.runFor(59_000);
      await expect(page.getByRole('heading', { name: 'test-b', exact: true })).toHaveCount(0);
      await page.clock.runFor(1000);
    }
    await expect(page.getByRole('heading', { name: 'test-b', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flip card', exact: true })).toBeFocused();
    await expect(page.getByText('Ready to review: 1 · New words left today: 0', { exact: true })).toBeVisible();
    await expect(page.locator('[data-vocabulary-face="back"] h2')).toHaveCount(0);
    await page.locator('[data-vocabulary-face="front"] h1').click();
    await expect(page.locator('[data-vocabulary-face="back"] h2')).toBeFocused();
    expect((await stored(page)).find((row) => row.key === 'test-b')!.history).toHaveLength(future ? 1 : 0);
  });
}

test('quota waiting wakes at local midnight, and a later external limit change wakes on focus', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 20, 23, 59, 49) });
  await page.clock.pauseAt(new Date(2026, 9, 20, 23, 59, 50));
  await seed(page, 'en', 'light', 1);
  await page.goto('/#/words/review');
  await expect(page.getByRole('heading', { name: 'test-a', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/vocabulary.ts' as string);
    const database: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    await storage.saveVocabularyPreferences({ newPerDay: 1, retentionPercent: 90, studyBook: 'mine' });
    // A deleted word still honestly consumed this day's allowance in the other tab.
    const date = new Date(Date.now());
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    await (
      await database.db()
    ).put('meta', { date: label, introducedKeys: ['deleted-test'] }, `vocabularyDay:${label}`);
  });
  await page.locator('[data-vocabulary-face="front"] h1').click();
  await expect(page.locator('[data-vocabulary-status]')).toContainText('You have reached today’s limit of new words');
  await expect(page.getByRole('heading', { name: 'Nothing more for now' })).toBeVisible();
  await page.clock.runFor(9999);
  await expect(page.getByRole('heading', { name: 'test-a', exact: true })).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(page.getByRole('heading', { name: 'test-a', exact: true })).toBeVisible();
  await expect(page.getByText('Ready to review: 0 · New words left today: 1', { exact: true })).toBeVisible();
  // Lose another reveal to a changed limit, then change it without a same-tab notification.
  await page.evaluate(async () => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/vocabulary.ts' as string);
    await storage.saveVocabularyPreferences({ newPerDay: 0, retentionPercent: 90, studyBook: 'mine' });
  });
  await page.locator('[data-vocabulary-face="front"] h1').click();
  await expect(page.getByRole('heading', { name: 'Nothing more for now' })).toBeVisible();
  await page.evaluate(async () => {
    const database: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    await (
      await database.db()
    ).put('meta', { newPerDay: 1, retentionPercent: 90, studyBook: 'mine' }, 'vocabularyPreferences');
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('heading', { name: 'test-a', exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('TEST meaning');
  expect((await stored(page))[0].introducedAt).toBeNull();
});

test('a true card read failure stays visible without an automatic retry loop, then explicit Retry selects safely', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(2026, 9, 20, 12) });
  await page.clock.pauseAt(new Date(2026, 9, 20, 12, 0, 1));
  await seed(page, 'en', 'light', 1);
  await page.evaluate(() => {
    const globals = globalThis as { cardReadAttempts?: number; restoreCardRead?: () => void };
    globals.cardReadAttempts = 0;
    // oxlint-disable-next-line typescript/unbound-method -- Native read fault restored below, not a global error suppression.
    const get = IDBObjectStore.prototype.get;
    globals.restoreCardRead = () => {
      IDBObjectStore.prototype.get = get;
    };
    IDBObjectStore.prototype.get = function (key) {
      if (this.name === 'vocab' && key === 'word:test-a') {
        globals.cardReadAttempts!++;
        throw new Error('TEST card read refused');
      }
      return get.call(this, key);
    };
  });
  const attempts = () => page.evaluate(() => (globalThis as { cardReadAttempts?: number }).cardReadAttempts);
  const restore = () => page.evaluate(() => (globalThis as { restoreCardRead?: () => void }).restoreCardRead?.());
  try {
    await page.goto('/#/words/review');
    await expect(page.locator('[data-vocabulary-status]')).toContainText('TEST card read refused');
    const failedAttempts = await attempts();
    await page.clock.runFor(5000);
    expect(await attempts()).toBe(failedAttempts);
    await expect(page.getByRole('heading', { name: 'test-a', exact: true })).toHaveCount(0);
    await restore();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'test-a', exact: true })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('TEST meaning');
  } finally {
    await restore();
  }
});
