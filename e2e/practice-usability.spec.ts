/** Owns Practice navigation and responsive table/add-choice regressions; not grading or provider behaviour. */
import { expect, overflowing, test } from './fixtures';
import { CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import { PRACTICE, seedUnits } from './practice.helpers';
import type { Page } from '@playwright/test';

const [first, second] = CATALOG_EXERCISES.units;
type Storage = typeof import('../src/storage/exercises');

async function checkItems(page: Page, unitId: string, items: { id: string; prompt: string }[], correct: boolean) {
  await page.evaluate(
    async ({ unitId, items, correct }) => {
      const storage: Storage = await import(/* @vite-ignore */ '/src/storage/exercises.ts' as string);
      const { emptyAnswer } = (await import(
        /* @vite-ignore */ '/src/services/exercises/answer.ts' as string
      )) as typeof import('../src/services/exercises/answer');
      for (const item of items) {
        const answer = emptyAnswer(item);
        answer.singleAnswer = 'test';
        answer.multiAnswers.fill('test');
        await storage.checkItem({
          unitId,
          itemId: item.id,
          resetToken: await storage.getResetToken(unitId),
          answer,
          result: { correct, strictAccents: false },
        });
      }
    },
    { unitId, items, correct },
  );
}

test('set action starts in number order, continues the first unfinished exercise and practises again', async ({
  page,
  ai,
}) => {
  void ai;
  await seedUnits(page, [
    { ...first, unitNumber: 2, setTitle: 'Mon cahier' },
    { ...second, unitNumber: 1, setTitle: 'Mon cahier' },
  ]);
  await page.goto('/#/grammar/exercises/set/set-1');
  const start = page.getByRole('button', { name: 'Start', exact: true });
  await expect(start).toBeVisible();
  await expect(start).toHaveClass(/bg-accent-700/);
  await expect(page.getByRole('link', { name: 'Back to exercises', exact: true }).locator('svg')).toHaveClass(
    /lucide-arrow-left/,
  );
  const del = page.getByRole('button', { name: 'Delete set', exact: true });
  await expect(del).not.toHaveClass(/bg-accent-700|bg-surface/);
  await expect(del.locator('svg')).toHaveClass(/lucide-trash-2/);
  await start.click();
  await expect(page).toHaveURL(new RegExp(`#/grammar/exercises/unit/${second.id}$`));
  await checkItems(page, second.id, [second.items[0]], false);
  await page.goto('/#/grammar/exercises/set/set-1');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/grammar/exercises/unit/${second.id}$`));
  await checkItems(page, second.id, [second.items[1]], true);
  await page.goto('/#/grammar/exercises/set/set-1');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/grammar/exercises/unit/${first.id}$`));
  await checkItems(page, first.id, first.items, true);
  await page.goto('/#/grammar/exercises/set/set-1');
  const again = page.getByRole('button', { name: 'Practise again', exact: true });
  await again.click();
  await expect(page).toHaveURL(new RegExp(`#/grammar/exercises/unit/${second.id}$`));
});

for (const phone of [false, true]) {
  test(`tables show real correct counts and give titles room in every theme ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    void ai;
    const longTitle = 'Une longue lecture pour comprendre les accords et les conjugaisons';
    await seedUnits(page, [
      { ...first, setTitle: longTitle },
      {
        ...second,
        setId: 'set-cjk',
        setTitle: '\u8fd9\u662f\u4e00\u4e2a\u7528\u4e8e\u68c0\u67e5\u6362\u884c\u7684\u4e2d\u6587\u957f\u6807\u9898',
      },
    ]);
    await checkItems(page, first.id, first.items, true);
    for (const mode of ['light', 'sepia', 'dark']) {
      await page.evaluate((mode) => localStorage.setItem('relire_theme', mode), mode);
      await page.goto(PRACTICE);
      await page.reload();
      const table = page.getByRole('table');
      await expect(table).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const row = table.locator('tbody tr').filter({ hasText: longTitle });
      const titleCell = row.locator('td').first();
      const progress = row.locator('td').nth(3);
      await expect(row).toContainText('1 of 1 checked · 1 correct');
      if (phone) {
        await expect(progress).toBeHidden();
        await expect(titleCell).toContainText('1 of 1 checked · 1 correct');
        expect((await titleCell.boundingBox())!.width).toBeGreaterThan(240);
      } else {
        await expect(row.locator('td').nth(1)).toHaveText('B1');
        await expect(titleCell).toContainText('B1 · Intermediate');
        await expect(titleCell).not.toContainText('1 exercise', { useInnerText: true });
        const levelHeight = await row
          .locator('td')
          .nth(1)
          .evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getBoundingClientRect().height;
          });
        expect(levelHeight).toBeLessThan(30);
      }
      await expect(row.getByRole('button', { name: /Delete/ })).toHaveCount(0);
      expect(await overflowing(page.locator('body'))).toEqual([]);
      await row.getByRole('link').click();
      await expect(page.getByRole('table')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const exercise = page.locator('main tbody tr');
      await expect(exercise.filter({ hasText: first.title })).toContainText('1 of 1 checked · 1 correct');
      if (phone) {
        await expect(exercise.locator('td').first()).toBeHidden();
        await expect(exercise.getByRole('link')).toContainText(`1. ${first.title}`);
        await expect(exercise.locator('td').nth(4)).toBeHidden();
        expect((await exercise.locator('td').nth(1).boundingBox())!.width).toBeGreaterThan(240);
      }
      expect(await overflowing(page.locator('body'))).toEqual([]);
    }
  });

  test(`empty Practice offers all three choices and the dialog describes its selected panel ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    void ai;
    await page.goto(PRACTICE);
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Add exercises', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add exercises' });
    await dialog.getByRole('button', { name: 'Conjugation drills', exact: true }).click();
    const article = dialog.getByRole('button', { name: 'Make from an article', exact: true });
    const drills = dialog.getByRole('button', { name: 'Conjugation drills', exact: true });
    await expect(drills).toHaveAttribute('aria-pressed', 'true');
    await expect(article).toHaveAttribute('aria-pressed', 'false');
    for (const name of ['Import a worksheet', 'Make from an article', 'Conjugation drills']) {
      const choice = dialog.getByRole('button', { name, exact: true });
      await expect(choice).toHaveAttribute('aria-describedby', /practice-choice-/);
      await expect(choice).toHaveClass(/border-ink-300/);
      if (phone) {
        await page.evaluate(() => document.fonts.ready);
        expect((await choice.boundingBox())!.width).toBeGreaterThan(270);
      }
    }
    await article.click();
    await expect(article).toHaveAttribute('aria-pressed', 'true');
    await expect(drills).toHaveAttribute('aria-pressed', 'false');
    await expect(article).toHaveClass(/aria-pressed:bg-accent-100/);
    expect(await overflowing(dialog)).toEqual([]);
  });
}
