/**
 * Helpers shared by the practice specs: seed exercise units straight into
 * IndexedDB (so a sheet test does not depend on generation), read the exercise
 * rows back, and find a numbered row of the open sheet.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, settled } from './fixtures';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';

type Storage = typeof import('../src/storage/exercises');
type Db = typeof import('../src/storage/db');

export const PRACTICE = '/#/practice';

/** Wait for committed sample initialization (the app has started and the database exists). */
export async function waitForArticle(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
        return (await (await db()).getAll('articles')).length;
      }),
    )
    .toBeGreaterThan(0);
}

/** Saves the units as one batch (`set-1`, B1, a fixed creation time, unless a unit says otherwise) and leaves the app on the library (the catalogue by default). */
export async function seedUnits(page: Page, units: unknown[] = CATALOG_EXERCISES.units) {
  await page.goto('/#/read');
  await waitForArticle(page);
  await page.evaluate(async (list) => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    const groups = new Map<string, object[]>();
    for (const candidate of list) {
      const unit = { setId: 'set-1', level: 'B1', createdAt: 1_700_000_000_000, ...(candidate as object) };
      const group = groups.get(unit.setId) ?? [];
      group.push(unit);
      groups.set(unit.setId, group);
    }
    for (const group of groups.values()) await storage.saveUnits(group as never);
  }, units);
}

/** Opens the Add dialog's article generation choice, leaving its form ready. */
export async function openGenerator(page: Page) {
  await page.getByRole('button', { name: 'Add exercises', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add exercises' });
  await dialog.getByRole('button', { name: 'Make from an article', exact: true }).click();
  return dialog;
}

/** Opens a set from the Practice table, then its requested exercise. */
export async function openListedUnit(page: Page, setId: string, unitId: string) {
  await page.locator(`main a[href="#/practice/set/${setId}"]`).click();
  await page.locator(`main a[href="#/practice/${unitId}"]`).click();
}

/** Every exercise row in IndexedDB. */
export function stored(page: Page) {
  return page.evaluate(async () => {
    const { db }: Db = await import(/* @vite-ignore */ '/src/storage/db.ts' as string);
    const d = await db();
    return {
      units: await d.getAll('units'),
      itemStates: await d.getAll('itemStates'),
      attempts: await d.getAll('attempts'),
    };
  });
}

/** The numbered row of the open sheet that contains this text. */
export const row = (page: Page, text: string | RegExp): Locator => page.getByRole('listitem').filter({ hasText: text });

export const checkButton = (item: Locator) => item.getByRole('button', { name: 'Check', exact: true });

/** Opens a seeded unit's sheet and waits for it. */
export async function openUnit(page: Page, unitId: string, title: string) {
  await page.goto(`/#/practice/${unitId}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await settled(page);
}
