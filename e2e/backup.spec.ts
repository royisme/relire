/**
 * Backups carry the exercise data: a backup file restored from Settings → Data brings back units, item
 * states and attempts that were cleared after it was made.
 */
import { expect, test } from './fixtures';

type Storage = typeof import('../src/storage/exercises');
type Db = typeof import('../src/storage/db');
type Units = typeof import('../tests/fixtures/units');
type Answers = typeof import('../src/services/exercises/answer');

const counts = () =>
  // Runs in the page: how many exercise rows of each kind are stored.
  (async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const d = await db();
    return {
      units: (await d.getAll('units')).length,
      itemStates: (await d.getAll('itemStates')).length,
      attempts: (await d.getAll('attempts')).length,
    };
  })();

test('a backup restored from Settings brings back exercise units, states and attempts', async ({ page, ai }) => {
  void ai; // onboards the app; nothing here calls the AI
  await page.goto('/#/read');
  await expect(page.getByText('Le Petit Prince').first()).toBeVisible();
  // Sample initialization commits before the library becomes ready.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
        return (await (await db()).getAll('articles')).length;
      }),
    )
    .toBeGreaterThan(0);

  const backup = await page.evaluate(async () => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    const { db, exportData }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const { ITEMS, unitOf }: Units = await import(/* @vite-ignore */ '/tests/fixtures/units.ts' as string);
    const { emptyAnswer }: Answers = await import(/* @vite-ignore */ '/src/services/exercises/answer.ts' as string);
    const [article] = await (await db()).getAll('articles');
    const [unit] = await storage.saveUnits(article.id, [{ ...unitOf('FILL_BLANKS', [ITEMS.FILL_BLANKS]), id: 'u1' }]);
    const item = unit.items[0];
    await storage.checkItem({
      unitId: unit.id,
      itemId: item.id,
      resetToken: await storage.getResetToken(unit.id),
      answer: { ...emptyAnswer(item), singleAnswer: 'faux' },
      result: { correct: false },
    });
    return JSON.stringify(await exportData());
  });
  expect(await page.evaluate(counts)).toEqual({ units: 1, itemStates: 1, attempts: 1 });

  // Clear the exercise rows, then restore the file through the real Settings control.
  await page.evaluate(async () => {
    const { importData }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    await importData({ units: [], itemStates: [], attempts: [] });
  });
  expect(await page.evaluate(counts)).toEqual({ units: 0, itemStates: 0, attempts: 0 });

  await page.goto('/#/settings/data');
  const reloaded = page.waitForEvent('load');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'relire-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await reloaded;
  await expect.poll(() => page.evaluate(counts)).toEqual({ units: 1, itemStates: 1, attempts: 1 });
});
