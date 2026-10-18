/**
 * Practice batches: listed newest first (each batch remembers when it was made), and deleting
 * one asks first, removes its units and their answers, and keeps the history of attempts.
 */
import { expect, overflowing, test } from './fixtures';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import { PRACTICE, seedUnits, stored } from './practice.helpers';

type Storage = typeof import('../src/storage/exercises');

const [first, second] = CATALOG_EXERCISES.units;

async function seedTwoBatches(page: import('@playwright/test').Page) {
  await seedUnits(page, []);
  await page.evaluate(
    async ({ older, newer }) => {
      const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
      // Saved newest first on purpose: the list must follow `createdAt`, not the order of saving.
      await storage.saveUnits([
        { ...newer, setId: 'set-new', setTitle: 'Le lot récent', level: 'A2', createdAt: 2_000 },
      ]);
      await storage.saveUnits([
        { ...older, setId: 'set-old', setTitle: 'Le lot ancien', level: 'B1', createdAt: 1_000 },
      ]);
      const unit = older;
      await storage.checkItem({
        unitId: unit.id,
        itemId: unit.items[0].id,
        resetToken: await storage.getResetToken(unit.id),
        answer: { singleAnswer: 'faux' } as never,
        result: { correct: false, strictAccents: false },
      });
    },
    { older: first, newer: second },
  );
}

const headings = (page: import('@playwright/test').Page) => page.getByRole('main').locator('h4');

for (const phone of [false, true]) {
  test(`batches are listed newest first and a batch is deleted after confirmation, keeping attempts ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    void ai;
    await seedTwoBatches(page);
    await page.goto(PRACTICE);
    await expect(headings(page)).toHaveText([/Le lot récent/, /Le lot ancien/]);
    expect(await overflowing(page.locator('body'))).toEqual([]);

    const before = await stored(page);
    expect(before.units).toHaveLength(2);
    expect(before.attempts).toHaveLength(1);

    const del = page.getByRole('button', { name: 'Delete this batch: Le lot ancien' });
    await del.click();
    const dialog = page.getByRole('dialog', { name: 'Delete this batch?' });
    await expect(dialog).toBeVisible();
    // Cancelling changes nothing.
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect((await stored(page)).units).toHaveLength(2);

    await del.click();
    await dialog.getByRole('button', { name: 'Delete this batch', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(headings(page)).toHaveText([/Le lot récent/]);
    const after = await stored(page);
    expect(after.units.map((unit) => unit.setId)).toEqual(['set-new']);
    expect(after.itemStates).toEqual([]);
    expect(after.attempts).toHaveLength(1);
  });
}

test('a failed delete keeps the dialog and shows the real reason', async ({ page, ai }) => {
  void ai;
  await seedTwoBatches(page);
  await page.goto(PRACTICE);
  await expect(headings(page)).toHaveCount(2);
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Invoked with its store below.
    const original = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === 'units') throw new Error('Storage test failure');
      return original.call(this, key);
    };
  });
  await page.getByRole('button', { name: 'Delete this batch: Le lot ancien' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this batch?' });
  await dialog.getByRole('button', { name: 'Delete this batch', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Storage test failure');
  await expect(headings(page)).toHaveCount(2);
  expect((await stored(page)).units).toHaveLength(2);
});
