/** Real Progress + adaptive persistence/lifetime, every AI call mocked with catalogue answers. */
import { test, expect, overflowing, layout, settled } from './fixtures';
import { CATALOG_ANSWERS, CATALOG_DRILLS, CATALOG_EXERCISES } from '../tests/fixtures/exerciseCatalog';
import type { Page } from '@playwright/test';
import { row, checkButton } from './practice.helpers';

async function history(page: Page) {
  await page.goto('/#/progress');
  await expect(page.getByRole('heading', { name: 'Grammar accuracy' })).toBeVisible();
  const catalogue = CATALOG_EXERCISES.units.flatMap((unit) => unit.items);
  const checks = [
    { id: 'fb-1', correct: false },
    { id: 'fb-1', correct: true },
    ...Array.from({ length: 8 }, () => ({ id: 'rc-2', correct: true })),
    { id: 'wt-1', correct: false },
    { id: 'gc-1', correct: false },
  ].map(({ id, correct }) => {
    const item = catalogue.find((entry) => entry.id === id)!;
    return {
      grammarTag: item.grammarTag,
      prompt: item.prompt,
      expectedAnswer: String(item.expectedAnswer),
      userAnswer: CATALOG_ANSWERS[id][correct ? 'right' : 'wrong'].singleAnswer,
      correct,
    };
  });
  await page.evaluate(async (rows) => {
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    const d = await db();
    const tx = d.transaction('attempts', 'readwrite');
    for (const [index, row] of rows.entries())
      await tx.store.add({
        id: `history-${index}`,
        unitId: 'deleted-unit',
        itemId: `item-${index}`,
        materialId: 'deleted-material',
        ...row,
        timestamp: index + 1,
      });
    await tx.done;
    const { exercisesChanged } = (await import(
      '/src/storage/exerciseEvents.ts' as string
    )) as typeof import('../src/storage/exerciseEvents');
    exercisesChanged();
  }, checks);
  await expect(page.getByText('90% · 9 / 10 correct', { exact: true })).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    const d = await db();
    return { articles: await d.getAll('articles'), units: await d.getAll('units') };
  });
}
async function failSaving(page: Page) {
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Invoked with its store below.
    const original = IDBObjectStore.prototype.add;
    const state = window as unknown as { restoreAdd: () => void; preparedWrites: { store: string; value: unknown }[] };
    state.preparedWrites = [];
    state.restoreAdd = () => {
      IDBObjectStore.prototype.add = original;
    };
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === 'articles' || this.name === 'units') state.preparedWrites.push({ store: this.name, value });
      if (this.name === 'units') throw new Error('Adaptive storage failure');
      return original.call(this, value, key);
    };
  });
}
for (const phone of [false, true]) {
  test(`Progress empty, weighted retained history, one workbook and sheet reload ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    await page.addInitScript((theme) => localStorage.setItem('relire_theme', theme), phone ? 'dark' : 'sepia');
    let finish!: () => void;
    const waiting = new Promise<void>((done) => {
      finish = done;
    });
    ai.answer({
      adaptive: async () => {
        await waiting;
        return CATALOG_DRILLS;
      },
    });
    await page.goto('/#/progress');
    await expect(page.getByText('Check some exercises to see accuracy by grammar area.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make a drill set' })).toBeDisabled();
    await history(page);
    for (const label of ['Nouns and determiners', 'Adjectives and adverbs', 'Verbs: forms']) {
      await expect(page.getByRole('term').filter({ hasText: label })).toBeVisible();
    }
    await expect(page.getByText(/Up to three lowest-accuracy/)).toContainText('Adjective agreement');
    expect(await overflowing(page.locator('body'))).toEqual([]);
    const before = await stored(page);
    const make = page.getByRole('button', { name: 'Make a drill set' });
    await make.scrollIntoViewIfNeeded();
    await settled(page);
    const geometry = await layout(page);
    const buttonBox = await make.boundingBox();
    await make.click();
    await expect.poll(() => ai.calls.adaptive).toBe(1);
    await expect(page.getByRole('combobox', { name: 'Level', exact: true })).toBeDisabled();
    expect(await layout(page)).toEqual(geometry);
    expect(await make.boundingBox()).toEqual(buttonBox);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    finish();
    await expect(page).toHaveURL(/#\/practice\/unit-/);
    await expect(page.getByRole('heading', { name: CATALOG_DRILLS.drillTitle })).toBeVisible();
    expect(ai.calls.adaptive).toBe(1);
    expect(ai.prompts.adaptive[0]).toContain(CATALOG_DRILLS.items[0].prompt);
    const after = await stored(page);
    expect(after.articles).toHaveLength(before.articles.length + 1);
    expect(after.units).toHaveLength(1);
    expect(after.articles.find((row) => row.id === after.units[0].materialId)).toMatchObject({
      kind: 'workbook',
      content: '',
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: CATALOG_DRILLS.drillTitle })).toBeVisible();
    for (const item of CATALOG_DRILLS.items.slice(0, 2)) {
      const exercise = row(page, item.prompt.split('[___]')[0].trim());
      await exercise.getByRole('textbox').fill(CATALOG_ANSWERS[item.id].right.singleAnswer);
      await checkButton(exercise).click();
      await expect(exercise.getByText('Correct', { exact: true })).toBeAttached();
    }
    const gender = row(page, CATALOG_DRILLS.items[2].prompt);
    await gender.getByRole('radio', { name: 'Feminine', exact: true }).click();
    await checkButton(gender).click();
    await expect(gender.getByText('Correct', { exact: true })).toBeAttached();
    expect(await overflowing(page.locator('body'))).toEqual([]);
  });
}

test('failed save keeps IDs, blocks edits, guards leave, retry makes no AI request, pending save cannot discard', async ({
  page,
  ai,
}) => {
  ai.answer({ adaptive: CATALOG_DRILLS });
  await history(page);
  await failSaving(page);
  const make = page.getByRole('button', { name: 'Make a drill set' });
  await settled(page);
  const before = await layout(page);
  const control = await make.boundingBox();
  await make.click();
  await expect(page.getByRole('status').filter({ hasText: 'Adaptive storage failure' })).toBeVisible();
  expect(await layout(page)).toEqual(before);
  expect(await page.getByRole('button', { name: 'Retry saving' }).boundingBox()).toEqual(control);
  await expect(page.getByRole('combobox', { name: 'Level', exact: true })).toBeDisabled();
  await expect(page.getByRole('spinbutton', { name: 'Items', exact: true })).toBeDisabled();
  const failed = await stored(page);
  expect(failed.units).toEqual([]);
  expect(failed.articles.filter((row) => row.kind === 'workbook')).toEqual([]);
  const writes = await page.evaluate(
    () => (window as unknown as { preparedWrites: { store: string; value: { id: string } }[] }).preparedWrites,
  );
  await page.getByRole('link', { name: 'Read', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard this drill set?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep this set' }).click();
  await expect(page).toHaveURL(/#\/progress$/);
  await page.evaluate(async () => {
    (window as unknown as { restoreAdd: () => void }).restoreAdd();
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    const tx = (await db()).transaction('articles', 'readwrite');
    const hold = () => {
      void tx.store.get('petit-prince').then(() => {
        if (!sessionStorage.getItem('releaseAdaptiveWrite')) hold();
      });
    };
    hold();
  });
  await page.getByRole('button', { name: 'Retry saving' }).dblclick();
  await expect(page.getByRole('button', { name: 'Retry saving' })).toBeDisabled();
  await page.getByRole('link', { name: 'Read', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
  await page.evaluate(() => sessionStorage.setItem('releaseAdaptiveWrite', '1'));
  await expect(page).toHaveURL(/#\/practice\/unit-/);
  const after = await stored(page);
  expect(after.units).toHaveLength(1);
  expect(after.units[0]).toEqual(writes.find((row) => row.store === 'units')!.value);
  expect(after.units[0].materialId).toBe(writes.find((row) => row.store === 'articles')!.value.id);
  expect(ai.calls.adaptive).toBe(1);
});

test('explicit discard required before replacement; failed set warns on reload', async ({ page, ai }) => {
  ai.answer({ adaptive: CATALOG_DRILLS });
  await history(page);
  await failSaving(page);
  await page.getByRole('button', { name: 'Make a drill set' }).click();
  await expect(page.getByRole('button', { name: 'Retry saving' })).toBeVisible();
  const dialog = page.waitForEvent('dialog');
  await page.evaluate(() => {
    setTimeout(() => window.location.reload(), 0);
  });
  const warning = await dialog;
  expect(warning.type()).toBe('beforeunload');
  await warning.dismiss();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Make a drill set' })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Level', exact: true })).toBeEnabled();
  expect(ai.calls.adaptive).toBe(1);
});

test('pending generation disables edits, leaving drops late paid output before storage', async ({ page, ai }) => {
  let resolve!: () => void;
  const waiting = new Promise<void>((done) => {
    resolve = done;
  });
  ai.answer({
    adaptive: async () => {
      await waiting;
      return CATALOG_DRILLS;
    },
  });
  await history(page);
  await page.getByRole('button', { name: 'Make a drill set' }).dblclick();
  await expect(page.getByRole('combobox', { name: 'Level', exact: true })).toBeDisabled();
  await expect.poll(() => ai.calls.adaptive).toBe(1);
  await page.getByRole('link', { name: 'Read', exact: true }).click();
  await expect(page).toHaveURL(/#\/read$/);
  const response = page.waitForResponse((value) => value.url().includes('generativelanguage'));
  resolve();
  await response;
  await page.goto('/#/progress');
  await expect(page.getByRole('heading', { name: 'Grammar accuracy' })).toBeVisible();
  expect((await stored(page)).units).toEqual([]);
});

test('AI errors stay inline and missing key returns through Settings', async ({ page, ai }) => {
  ai.fail(['adaptive']);
  await history(page);
  await page.getByRole('button', { name: 'Make a drill set' }).click();
  await expect(page.getByRole('status').filter({ hasText: /adaptive failed/ })).toBeVisible({ timeout: 30000 });
  expect((await stored(page)).units).toEqual([]);
  await page.evaluate(() => localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: {} })));
  await page.reload();
  await page.getByRole('button', { name: 'Make a drill set' }).click();
  await expect(page).toHaveURL(/#\/settings\/text-ai$/);
  const back = page.getByRole('button', { name: 'Go back to where you were' });
  await expect(back).toBeDisabled();
  await page.getByLabel('Google Gemini API key', { exact: true }).fill('TEST-RETURN');
  await page.getByRole('button', { name: 'Check and save', exact: true }).click();
  await expect(back).toBeEnabled();
  await back.click();
  await expect(page).toHaveURL(/#\/progress$/);
});

for (const theme of ['light', 'sepia', 'dark']) {
  test(`localized Progress controls fit ${theme} @phone`, async ({ page, ai }) => {
    await page.addInitScript((value) => localStorage.setItem('relire_theme', value), theme);
    ai.answer({ adaptive: CATALOG_DRILLS });
    await history(page);
    await page.evaluate(() => localStorage.setItem('relire_lang', 'zh'));
    await page.reload();
    await expect(page.getByRole('heading', { name: '语法正确率' })).toBeVisible();
    expect(await overflowing(page.locator('body'))).toEqual([]);
  });
}

test('failed history refresh hides stale targeting; all-perfect history offers no drills', async ({ page, ai }) => {
  void ai;
  await history(page);
  await page.evaluate(async () => {
    // oxlint-disable-next-line typescript/unbound-method -- Invoked with its store below.
    const original = IDBObjectStore.prototype.getAll;
    (window as unknown as { restoreRead: () => void }).restoreRead = () => {
      IDBObjectStore.prototype.getAll = original;
    };
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'attempts') throw new Error('History read refused');
      return original.apply(this, args);
    };
    const { exercisesChanged } = (await import(
      '/src/storage/exerciseEvents.ts' as string
    )) as typeof import('../src/storage/exerciseEvents');
    exercisesChanged();
  });
  await expect(page.getByRole('status').filter({ hasText: 'History read refused' })).toBeVisible();
  await expect(page.getByText('90% · 9 / 10 correct', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Make a drill set' })).toBeDisabled();
  await page.evaluate(async () => {
    (window as unknown as { restoreRead: () => void }).restoreRead();
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    const d = await db();
    const rows = await d.getAll('attempts');
    const tx = d.transaction('attempts', 'readwrite');
    for (const row of rows) await tx.store.put({ ...row, correct: true });
    await tx.done;
    const { exercisesChanged } = (await import(
      '/src/storage/exerciseEvents.ts' as string
    )) as typeof import('../src/storage/exerciseEvents');
    exercisesChanged();
  });
  await expect(page.getByText('100% · 10 / 10 correct', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make a drill set' })).toBeDisabled();
});
