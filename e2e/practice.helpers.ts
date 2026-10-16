/**
 * Helpers shared by the practice specs: seed exercise units straight into
 * IndexedDB (so a sheet test does not depend on generation), read the exercise
 * rows back, and find a numbered row of the open sheet.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';
import { sampleExercises } from './practiceFixtures';

type Storage = typeof import('../src/storage/exercises');
type Db = typeof import('../src/storage/db');

export const ARTICLE = 'petit-prince';
export const PRACTICE = `/#/practice?article=${ARTICLE}`;

/** The sample article reaches IndexedDB with the app's debounced save; units need it to exist. */
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

/** Saves units for the sample article and leaves the app on the library. */
export async function seedUnits(page: Page, units: unknown[] = sampleExercises.units) {
  await page.goto('/#/read');
  await waitForArticle(page);
  await page.evaluate(async (list) => {
    const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
    await storage.saveUnits('petit-prince', list as never);
  }, units);
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
}
