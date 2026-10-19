/** Exercise import (Practice) with explicit per-source AI answers; no real provider calls. */
import { test, expect, overflowing } from './fixtures';
import { draftFixture } from '../tests/fixtures/importDraft';
import { ITEMS } from '../tests/fixtures/units';
import { materialPdf, tinyPng } from './materialPdf';
import { importSourceChecks } from './importSourceChecks';
const draft = (): import('../src/services/exercises/importDraft').ImportDraft => ({
  ...draftFixture,
  units: draftFixture.units.map((unit) => ({
    ...unit,
    items: [{ ...unit.items[0], expectedAnswer: ITEMS.WORD_TRANSFORM.expectedAnswer }],
  })),
});
const WORKSHEET = 'Exercice 1. Complétez avec être.';
importSourceChecks({
  enter,
  textLabel: 'Text to send',
  analyze: 'Send and extract',
  task: 'extract',
  answer: draft(),
  review: 'Review and correct',
});
async function enter(page: import('@playwright/test').Page) {
  await page.goto('/#/practice');
  await page.getByRole('button', { name: 'Add exercises', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add exercises' })
    .getByRole('button', { name: 'Import a worksheet', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/import\/exercises$/);
}
const chooseLevel = (page: import('@playwright/test').Page, level = 'B2') =>
  page.getByLabel('Level of these exercises', { exact: true }).selectOption(level);
async function extractText(page: import('@playwright/test').Page) {
  await page.getByLabel('Text to send').fill(WORKSHEET);
  await expect(page.getByText('Recipient: Google Gemini · gemini-2.5-flash')).toBeVisible();
  // No files are held: the empty value reads like a label, not a stray word.
  await expect(page.getByText('None', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Send and extract' }).click();
  await expect(page.getByRole('heading', { name: 'Review and correct' })).toBeVisible();
}
const savedRows = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    const d = await db();
    return { articles: await d.getAll('articles'), units: await d.getAll('units') };
  });

const setUrl = /#\/practice\/set\/[0-9a-f-]+$/;

for (const phone of [false, true]) {
  test(`text review, blocker exclusion, required level and a durable exercises batch ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    await page.addInitScript((theme) => localStorage.setItem('relire_theme', theme), phone ? 'dark' : 'sepia');
    ai.answer({ extract: draft() });
    await enter(page);
    await extractText(page);
    await expect(page.locator('main')).toBeVisible();
    expect(await overflowing(page.locator('body'))).toEqual([]);
    // Saving as an article is not offered here: this page makes exercises only.
    await expect(page.getByLabel('Save as')).toHaveCount(0);
    await page.getByLabel('Exercise set title', { exact: true }).fill('Imported workbook');
    await page.locator('summary').filter({ hasText: ITEMS.WORD_TRANSFORM.prompt }).click();
    await page.getByLabel('Reference answer', { exact: true }).fill('française');
    await expect(page.getByText('Edited by you')).toBeVisible();
    await page.getByLabel('I have reviewed').check();
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    // The level is chosen once per import and is required; nothing is saved without it.
    await expect(page.getByRole('status')).toContainText('Choose the level');
    await expect(page).toHaveURL(/#\/import\/exercises$/);
    expect((await savedRows(page)).units).toEqual([]);
    await expect(page.getByLabel('Level of these exercises', { exact: true })).toHaveValue('');
    await chooseLevel(page, 'B2');
    await page.getByLabel('I have reviewed').check();
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    // The new exercise set opens.
    await expect(page).toHaveURL(setUrl);
    const saved = await savedRows(page);
    expect(saved.articles.filter((row) => row.title === 'Imported workbook')).toEqual([]);
    expect(saved.units).toHaveLength(1);
    expect(saved.units[0]).toMatchObject({ setTitle: 'Imported workbook', level: 'B2' });
    expect(saved.units[0]).not.toHaveProperty('materialId');
    await expect(page).toHaveURL(new RegExp(`#/practice/set/${saved.units[0].setId}$`));
    await expect(page.getByRole('heading', { name: 'Imported workbook' })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: saved.units[0].title })).toBeVisible();
    await page.goto('/#/practice');
    await expect(page.locator('main tbody tr').filter({ hasText: 'Imported workbook' })).toContainText('B2');
  });
}

test('one batch: every unit shares the set id, the level and the creation time', async ({ page, ai }) => {
  const two = draft();
  two.units.push({ ...two.units[0], id: 'u2', unitNumber: 2, title: 'Deuxième unité' });
  two.units[0].unitNumber = 2;
  two.units[1].unitNumber = 1;
  ai.answer({ extract: two });
  await enter(page);
  await extractText(page);
  await chooseLevel(page, 'A2');
  const before = Date.now();
  await page.getByLabel('I have reviewed').check();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page).toHaveURL(setUrl);
  const { units } = await savedRows(page);
  expect(units).toHaveLength(2);
  expect(new Set(units.map((unit) => unit.setId)).size).toBe(1);
  expect(new Set(units.map((unit) => unit.level))).toEqual(new Set(['A2']));
  expect(new Set(units.map((unit) => unit.createdAt)).size).toBe(1);
  expect(units[0].createdAt).toBeGreaterThanOrEqual(before);
  // It opens on the new set, which lists every exercise of the batch.
  await expect(page).toHaveURL(new RegExp(`#/practice/set/${units[0].setId}$`));
  await expect(page.getByRole('heading', { name: 'Mon document' })).toBeVisible();
  await expect(page.locator('main').getByRole('link', { name: 'Deuxième unité' })).toBeVisible();
  await expect(
    page.locator('main').getByRole('link', { name: units.find((unit) => unit.title !== 'Deuxième unité')!.title }),
  ).toBeVisible();
});

for (const phone of [false, true]) {
  test(`a title is required; the batch saves once it has one ${phone ? '@phone' : ''}`, async ({ page, ai }) => {
    ai.answer({ extract: { ...draft(), materialTitle: undefined } });
    await enter(page);
    await extractText(page);
    await chooseLevel(page, 'A2');
    await page.getByLabel('I have reviewed').check();
    expect(await overflowing(page.locator('body'))).toEqual([]);
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    await expect(page.getByRole('status')).toContainText('Enter a title');
    await expect(page).toHaveURL(/#\/import\/exercises$/);
    expect((await savedRows(page)).units).toEqual([]);
    await page.getByLabel('Exercise set title', { exact: true }).fill('Mon lot');
    await page.getByLabel('I have reviewed').check();
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    await expect(page).toHaveURL(setUrl);
    const saved = await savedRows(page);
    expect(saved.units).toHaveLength(1);
    expect(saved.units[0]).toMatchObject({ setTitle: 'Mon lot', level: 'A2' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mon lot' })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: saved.units[0].title })).toBeVisible();
  });
}

test('failed atomic save keeps draft and guard, retry keeps prepared identities', async ({ page, ai }) => {
  ai.answer({ extract: draft() });
  await enter(page);
  await extractText(page);
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Invoked with its store below.
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restorePut: () => void }).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'units') throw new Error('Storage test failure');
      return original.call(this, value, key);
    };
  });
  await chooseLevel(page);
  await page.getByLabel('I have reviewed').check();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Storage test failure' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.evaluate(() => (window as unknown as { restorePut: () => void }).restorePut());
  await page.evaluate(async () => {
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    const tx = (await db()).transaction('units', 'readwrite');
    const hold = () => {
      void tx.store.get('held').then(() => {
        if (!sessionStorage.getItem('releaseImportWrite')) hold();
      });
    };
    hold();
  });
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page.getByLabel('Exercise set title', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
  await page.evaluate(() => sessionStorage.setItem('releaseImportWrite', '1'));
  await expect(page).toHaveURL(setUrl);
});

test('image and PDF selection, cancellation ignores late extraction', async ({ page, ai }) => {
  ai.answer({
    extract: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return draft();
    },
  });
  await enter(page);
  await page.getByLabel('Choose an image or PDF').setInputFiles(tinyPng);
  await expect(page.getByRole('img', { name: 'Page 1 of tiny.png', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Send and extract' }).click();
  await expect.poll(() => ai.calls.extract).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Remove image tiny.png', exact: true }).click();
  await page
    .getByLabel('Choose an image or PDF')
    .setInputFiles({ name: 'pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(materialPdf()) });
  await expect(page.getByLabel('Pages to send')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Page 1 of pages.pdf', exact: true })).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByRole('heading', { name: 'Review and correct' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Send and extract' }).click();
  await expect(page.getByRole('heading', { name: 'Review and correct' })).toBeVisible();
  // This page never reads an article: no transcription request was made.
  expect(ai.calls.transcribe).toBe(0);
});

test('blockers cannot partially save; explicit exclusion lets the rest through', async ({ page, ai }) => {
  const blocked = draft();
  blocked.units[0].items.push({
    ...blocked.units[0].items[0],
    id: 'blocked',
    prompt: 'Question illisible',
    blockers: ['Unreadable source'],
  });
  ai.answer({ extract: blocked });
  await enter(page);
  await extractText(page);
  await chooseLevel(page, 'C1');
  await page.getByLabel('I have reviewed').check();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page.getByRole('status')).toContainText('resolve or exclude');
  await expect(page).toHaveURL(/#\/import\/exercises$/);
  await page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Question illisible' }) })
    .locator('..')
    .getByRole('button', { name: 'Exclude', exact: true })
    .click();
  await page.getByLabel('I have reviewed').check();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page).toHaveURL(setUrl);
  expect((await savedRows(page)).units).toMatchObject([{ setTitle: 'Mon document', level: 'C1' }]);
});

test('the mode decides the request, and a draft with no unit cannot be saved', async ({ page, ai }) => {
  ai.answer({ extract: { ...draftFixture, units: [] } });
  await enter(page);
  await page.getByLabel('Extraction mode').selectOption('extract');
  await extractText(page);
  expect(ai.prompts.extract[0]).toContain('Extract only.');
  await chooseLevel(page, 'B1');
  await page.getByLabel('I have reviewed').check();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page.getByRole('status')).toContainText('at least one playable exercise unit');
  expect((await savedRows(page)).units).toEqual([]);
});

test('consent pins model across asynchronous PDF rendering; unsupported images make no request', async ({
  page,
  ai,
}) => {
  ai.answer({ extract: draft() });
  await enter(page);
  await page
    .getByLabel('Choose an image or PDF')
    .setInputFiles({ name: 'pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(materialPdf()) });
  await expect(page.getByLabel('Pages to send')).toBeVisible();
  const sentModels: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('generativelanguage')) sentModels.push(request.url());
  });
  await page.evaluate(async () => {
    const { saveAppSettings } = (await import(
      '/src/utils/appSettings.ts' as string
    )) as typeof import('../src/utils/appSettings');
    saveAppSettings({ textModel: 'gemini-2.5-pro' });
  });
  await expect(page.getByText('Recipient: Google Gemini · gemini-2.5-flash')).toBeVisible();
  await page.getByRole('button', { name: 'Send and extract' }).click();
  await expect(page.getByRole('heading', { name: 'Review and correct' })).toBeVisible();
  expect(sentModels).toHaveLength(1);
  expect(sentModels[0]).toContain('gemini-2.5-flash:');
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  // A speech model is known not to read images: choose it for OCR and the import refuses before sending.
  await page.getByRole('link', { name: 'Text AI settings' }).click();
  await page.evaluate(async () => {
    const { saveAppSettings } = (await import(
      '/src/utils/appSettings.ts' as string
    )) as typeof import('../src/utils/appSettings');
    saveAppSettings({ ocrModel: 'gemini-3.8-flash-lite-tts' });
    const { navigate } = (await import('/src/hooks/useRoute.ts' as string)) as typeof import('../src/hooks/useRoute');
    navigate({ name: 'importExercises' });
  });
  await page
    .getByLabel('Choose an image or PDF')
    .setInputFiles({ name: 'pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(materialPdf()) });
  await expect(page.getByText('This model cannot read images.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send and extract' })).toBeDisabled();
  expect(ai.calls.extract).toBe(1);
});
