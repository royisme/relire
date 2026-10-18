/** Passage fixtures reuse the existing exercise catalogue and real Reader controls. */
import type { Page } from '@playwright/test';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import { seedUnits, openUnit } from './practice.helpers';
export const unitId = 'unit-reading-cloze';
export const title = 'Une promenade au jardin';
export const content = 'Nous visitons le jardin. Les oiseaux chantent dans les arbres.';
export const card = (page: Page) => page.locator('[data-practice-card]');
export type Db = typeof import('../src/storage/db');
export type Exercises = typeof import('../src/storage/exercises');
export async function trackPlayback(page: Page) {
  await page.addInitScript(() => {
    const types = new Map<string, string>();
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (value: Blob | MediaSource) => {
      const url = create(value);
      if (value instanceof Blob) types.set(url, value.type);
      return url;
    };
    const plays: string[] = [];
    (window as unknown as { passagePlays: string[] }).passagePlays = plays;
    // oxlint-disable-next-line typescript/unbound-method -- Called with the original media element below.
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      plays.push(types.get(this.src)?.includes('wav') ? 'reference' : 'take');
      return play.call(this);
    };
  });
}
export const plays = (page: Page) =>
  page.evaluate(() => (window as unknown as { passagePlays: string[] }).passagePlays);

export async function prepare(page: Page) {
  const unit = structuredClone(CATALOG_EXERCISES.units.find((u) => u.id === unitId)!);
  unit.readingPassage = { title, content };
  await seedUnits(page, [unit]);
  await openUnit(page, unitId, 'Compléter le passage');
}

export async function chooseSentence(page: Page) {
  const sentence = page.locator('article [data-sentence]').nth(1);
  await sentence.getByRole('button').first().focus();
  return sentence;
}
