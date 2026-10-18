/** Owns set-table and deletion browser coverage; uses stored fixtures, not AI generation or visual gates. */
import { expect, overflowing, test } from './fixtures';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import { PRACTICE, seedUnits, stored } from './practice.helpers';
import type { Page } from '@playwright/test';

type Storage = typeof import('../src/storage/exercises');
const [first, second] = CATALOG_EXERCISES.units;

async function seedTwoSets(page: Page) {
  await seedUnits(page, [
    { ...second, setId: 'set-new', setTitle: 'Le lot récent', level: 'A2', createdAt: 2_000 },
    { ...first, setId: 'set-old', setTitle: 'Le lot ancien', level: 'B1', createdAt: 1_000 },
  ]);
  await page.evaluate(async (unit) => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    await storage.checkItem({
      unitId: unit.id,
      itemId: unit.items[0].id,
      resetToken: await storage.getResetToken(unit.id),
      answer: { singleAnswer: 'faux' } as never,
      result: { correct: false, strictAccents: false },
    });
  }, first);
}
const titles = (page: Page) => page.locator('main tbody tr td:first-child a > span:first-child');

test('set columns, newest first, all four sorts, title search and present-level filter', async ({ page, ai }) => {
  void ai;
  await seedTwoSets(page);
  await page.goto(PRACTICE);
  await expect(page.getByRole('table')).toBeVisible();
  for (const name of ['Title', 'Level', 'Exercises', 'Progress', 'Added'])
    await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
  await expect(page.getByText('2 exercise sets', { exact: true })).toBeVisible();
  await expect(titles(page)).toHaveText(['Le lot récent', 'Le lot ancien']);
  const added = page.getByRole('columnheader', { name: 'Added', exact: true });
  await expect(added).toHaveAttribute('aria-sort', 'descending');
  await added.getByRole('button').click();
  await expect(added).toHaveAttribute('aria-sort', 'ascending');
  await expect(titles(page)).toHaveText(['Le lot ancien', 'Le lot récent']);
  for (const name of ['Title', 'Level', 'Progress']) {
    const header = page.getByRole('columnheader', { name, exact: true });
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', name === 'Progress' ? 'descending' : 'ascending');
    await expect(titles(page)).toHaveText(
      name === 'Level' ? ['Le lot récent', 'Le lot ancien'] : ['Le lot ancien', 'Le lot récent'],
    );
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', name === 'Progress' ? 'ascending' : 'descending');
  }
  const search = page.getByRole('searchbox', { name: 'Search exercise sets' });
  await search.fill(' ANCIEN ');
  await expect(titles(page)).toHaveText(['Le lot ancien']);
  const levels = page.getByRole('radiogroup', { name: 'Level', exact: true });
  await expect(levels.getByRole('radio')).toHaveCount(3);
  await levels.getByRole('radio', { name: 'A2', exact: true }).click();
  await expect(page.getByText('No exercise sets match your filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(search).toHaveValue('');
  await expect(titles(page)).toHaveCount(2);
  await levels.getByRole('radio', { name: 'B1', exact: true }).click();
  await expect(titles(page)).toHaveText(['Le lot ancien']);
});

for (const phone of [false, true]) {
  test(`set row deletion names the set and exercise count and retains attempts ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    void ai;
    await seedTwoSets(page);
    await page.goto(PRACTICE);
    await expect(titles(page)).toHaveText(['Le lot récent', 'Le lot ancien']);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    const del = page.getByRole('button', { name: 'Delete set Le lot ancien', exact: true });
    await expect(del).toHaveAttribute('title', 'Delete set Le lot ancien');
    await del.click();
    const dialog = page.getByRole('dialog', { name: 'Delete this exercise set?' });
    await expect(dialog).toContainText('“Le lot ancien”, its 1 exercise');
    await expect(dialog).toContainText('answers');
    await expect(dialog).toContainText('attempt history stays in the mistake notebook');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await stored(page)).units).toHaveLength(2);
    await del.click();
    await dialog.getByRole('button', { name: 'Delete set', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(titles(page)).toHaveText(['Le lot récent']);
    const after = await stored(page);
    expect(after.units.map((unit) => unit.setId)).toEqual(['set-new']);
    expect(after.itemStates).toEqual([]);
    expect(after.attempts).toHaveLength(1);
  });
}

test('failed set delete keeps the dialog, real error and rows', async ({ page, ai }) => {
  void ai;
  await seedTwoSets(page);
  await page.goto(PRACTICE);
  await expect(titles(page)).toHaveCount(2);
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Invoked with its store below.
    const original = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === 'units') throw new Error('Storage test failure');
      return original.call(this, key);
    };
  });
  await page.getByRole('button', { name: 'Delete set Le lot ancien' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this exercise set?' });
  await dialog.getByRole('button', { name: 'Delete set', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Storage test failure');
  await expect(titles(page)).toHaveCount(2);
  expect((await stored(page)).units).toHaveLength(2);
});

test('set page lists numbered exercises; deleting one refreshes and deleting the last returns to Practice', async ({
  page,
  ai,
}) => {
  void ai;
  await seedUnits(page, [
    { ...first, unitNumber: 2, setTitle: 'Mon cahier' },
    { ...second, unitNumber: 1, setTitle: 'Mon cahier' },
  ]);
  await page.goto(PRACTICE);
  await page.locator('main a[href="#/practice/set/set-1"]').click();
  await expect(page).toHaveURL(/#\/practice\/set\/set-1$/);
  await expect(page.getByRole('heading', { name: 'Mon cahier', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('B1 · Intermediate · 14 Nov 2023 · 2 exercises');
  for (const name of ['Number', 'Title', 'Type', 'Items', 'Progress'])
    await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
  await expect(page.locator('main tbody tr td:first-child')).toHaveText(['1', '2']);
  await page.locator(`main a[href="#/practice/${second.id}"]`).click();
  await expect(page.getByRole('heading', { name: second.title, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Mon cahier', exact: true }).click();
  const del = page.getByRole('button', { name: `Delete exercise ${second.title}`, exact: true });
  await expect(del).toHaveAttribute('title', `Delete exercise ${second.title}`);
  await del.click();
  const dialog = page.getByRole('dialog', { name: 'Delete this exercise?' });
  await expect(dialog).toContainText(second.title);
  await expect(dialog).toContainText('attempt history stays');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await stored(page)).units).toHaveLength(2);
  await del.click();
  await dialog.getByRole('button', { name: 'Delete exercise', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('main tbody tr')).toHaveCount(1);
  await expect(page).toHaveURL(/#\/practice\/set\/set-1$/);
  await page.getByRole('button', { name: `Delete exercise ${first.title}`, exact: true }).click();
  await expect(dialog).toContainText('last exercise');
  await expect(dialog).toContainText('exercise set will also be removed');
  await dialog.getByRole('button', { name: 'Delete exercise', exact: true }).click();
  await expect(page).toHaveURL(/#\/practice$/);
  await expect(page.getByText('No exercise sets yet')).toBeVisible();
  expect((await stored(page)).units).toEqual([]);
});

test('set page supports quiet set deletion and unknown-set recovery', async ({ page, ai }) => {
  void ai;
  await seedTwoSets(page);
  await page.goto('/#/practice/set/set-new');
  const del = page.getByRole('main').getByRole('button', { name: 'Delete set', exact: true });
  await expect(del).toHaveClass(/bg-surface/);
  await del.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete set', exact: true }).click();
  await expect(page).toHaveURL(/#\/practice$/);
  await page.goto('/#/practice/set/missing');
  await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to Practice' }).click();
  await expect(page).toHaveURL(/#\/practice$/);
});

test('loading owns a fixed-height busy region and load failures stay inline', async ({ page, ai }) => {
  void ai;
  await seedUnits(page, [first]);
  await page.evaluate(async () => {
    const { db } = (await import(
      /* @vite-ignore */ '/src/storage/db.ts' as string
    )) as typeof import('../src/storage/db');
    const tx = (await db()).transaction('units', 'readwrite');
    const hold = () => {
      void tx.store.get('held').then(() => {
        if (!sessionStorage.getItem('releaseSetRead')) hold();
      });
    };
    hold();
    const { navigate } = (await import(
      /* @vite-ignore */ '/src/hooks/useRoute.ts' as string
    )) as typeof import('../src/hooks/useRoute');
    navigate({ name: 'practice' });
  });
  const busy = page.locator('main [aria-busy="true"]');
  await expect(busy).toBeVisible();
  expect((await busy.boundingBox())!.height).toBe(224);
  await page.evaluate(() => sessionStorage.setItem('releaseSetRead', '1'));
  await expect(page.getByRole('table')).toBeVisible();
  await page.evaluate(async () => {
    const { navigate } = (await import(
      /* @vite-ignore */ '/src/hooks/useRoute.ts' as string
    )) as typeof import('../src/hooks/useRoute');
    navigate({ name: 'library' });
  });
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    // oxlint-disable-next-line typescript/unbound-method -- Invoked with its store below.
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'units') throw new Error('Exercise list read failed');
      return original.apply(this, args);
    };
    const { navigate } = (await import(
      /* @vite-ignore */ '/src/hooks/useRoute.ts' as string
    )) as typeof import('../src/hooks/useRoute');
    navigate({ name: 'practice' });
  });
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Exercise list read failed');
  await expect(page.getByText('No exercise sets yet', { exact: true })).toHaveCount(0);
});

test('exercise delete failure stays open without removing the row', async ({ page, ai }) => {
  void ai;
  await seedUnits(page, [first]);
  await page.goto('/#/practice/set/set-1');
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Invoked with its store below.
    const original = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === 'units') throw new Error('Exercise delete failure');
      return original.call(this, key);
    };
  });
  await page.getByRole('button', { name: `Delete exercise ${first.title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this exercise?' });
  await dialog.getByRole('button', { name: 'Delete exercise', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Exercise delete failure');
  expect((await stored(page)).units).toHaveLength(1);
});
