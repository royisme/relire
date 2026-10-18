/** Import workspace with explicit per-source AI answers; no real provider calls. */
import { test, expect, overflowing } from './fixtures';
import { draftFixture } from '../tests/fixtures/importDraft';
import { ITEMS } from '../tests/fixtures/units';
import { materialPdf } from './materialPdf';
const draft = (): import('../src/services/exercises/importDraft').ImportDraft => ({
  ...draftFixture,
  units: draftFixture.units.map((unit) => ({
    ...unit,
    items: [{ ...unit.items[0], expectedAnswer: ITEMS.WORD_TRANSFORM.expectedAnswer }],
  })),
});
async function enter(page: import('@playwright/test').Page) {
  await page.goto('/#/read');
  await page.getByRole('button', { name: 'Add article', exact: true }).click();
  await page.getByRole('button', { name: 'Import from image, PDF or text' }).click();
  await expect(page).toHaveURL(/#\/import$/);
}
const chooseLevel = (page: import('@playwright/test').Page, level = 'B2') =>
  page.getByLabel('Level (exercises)', { exact: true }).selectOption(level);
async function extractText(page: import('@playwright/test').Page) {
  await page.getByLabel('Text to send').fill(draftFixture.sourceText);
  await expect(page.getByText('Recipient: Google Gemini · gemini-2.5-flash')).toBeVisible();
  await page.getByRole('button', { name: 'Send and extract' }).click();
  await expect(page.getByRole('heading', { name: 'Review and correct' })).toBeVisible();
}
const savedRows = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    const d = await db();
    return { articles: await d.getAll('articles'), units: await d.getAll('units') };
  });

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
    await page.getByLabel('Material title', { exact: true }).fill('Imported workbook');
    await page.locator('summary').filter({ hasText: ITEMS.WORD_TRANSFORM.prompt }).click();
    await page.getByLabel('Reference answer', { exact: true }).fill('française');
    await expect(page.getByText('Edited by you')).toBeVisible();
    await page.getByLabel('I have reviewed').check();
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    // The level is chosen once per import and is required; nothing is saved without it.
    await expect(page.getByRole('status')).toContainText('Choose the level');
    await expect(page).toHaveURL(/#\/import$/);
    expect((await savedRows(page)).units).toEqual([]);
    await chooseLevel(page, 'B2');
    await page.getByLabel('I have reviewed').check();
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    await expect(page).toHaveURL(/#\/practice$/);
    const saved = await savedRows(page);
    expect(saved.articles.filter((row) => row.title === 'Imported workbook')).toEqual([]);
    expect(saved.units).toHaveLength(1);
    expect(saved.units[0]).toMatchObject({ setTitle: 'Imported workbook', level: 'B2' });
    expect(saved.units[0]).not.toHaveProperty('materialId');
    await expect(page.getByRole('main').getByRole('heading', { name: /^Imported workbook/ })).toContainText('B2');
  });
}

test('saving as an article stores the article and no unit', async ({ page, ai }) => {
  ai.answer({ extract: draft() });
  await enter(page);
  await extractText(page);
  await page.getByLabel('Material title', { exact: true }).fill('Imported article');
  await page.getByLabel('Save as', { exact: true }).selectOption('article');
  await page.getByLabel('I have reviewed').check();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page).toHaveURL(/#\/read\/material-/);
  const saved = await savedRows(page);
  expect(saved.articles.filter((row) => row.title === 'Imported article')).toHaveLength(1);
  expect(saved.units).toEqual([]);
});

for (const phone of [false, true]) {
  test(`empty source text blocks an article but saves exercises ${phone ? '@phone' : ''}`, async ({ page, ai }) => {
    ai.answer({ extract: { ...draft(), sourceText: '' } });
    await enter(page);
    await extractText(page);
    await page.getByLabel('Save as', { exact: true }).selectOption('article');
    await page.getByLabel('I have reviewed').check();
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    await expect(page.getByRole('status')).toContainText('source text');
    await expect(page).toHaveURL(/#\/import$/);
    const before = await savedRows(page);
    expect(before.articles.filter((row) => row.id.startsWith('material-'))).toEqual([]);
    expect(before.units).toEqual([]);
    await page.getByLabel('Save as', { exact: true }).selectOption('exercises');
    await chooseLevel(page, 'A2');
    await page.getByLabel('I have reviewed').check();
    expect(await overflowing(page.locator('body'))).toEqual([]);
    await page.getByRole('button', { name: 'Confirm and save' }).click();
    await expect(page).toHaveURL(/#\/practice$/);
    const saved = await savedRows(page);
    expect(saved.articles).toHaveLength(before.articles.length);
    expect(saved.units).toHaveLength(1);
    expect(saved.units[0]).toMatchObject({ setTitle: 'Mon document', level: 'A2' });
    expect(saved.units[0].importSource?.extractedText).toBe('');
    await page.reload();
    await page.locator(`main a[href="#/practice/${saved.units[0].id}"]`).click();
    await expect(page.getByRole('heading', { name: saved.units[0].title })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: saved.units[0].title })).toBeVisible();
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
  await expect(page.getByLabel('Material title', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
  await page.evaluate(() => sessionStorage.setItem('releaseImportWrite', '1'));
  await expect(page).toHaveURL(/#\/practice$/);
});

test('image and PDF selection, cancellation ignores late extraction', async ({ page, ai }) => {
  ai.answer({
    extract: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return draft();
    },
  });
  await enter(page);
  await page.getByLabel('Choose an image or PDF').setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByText(/tiny.png · 1 page/)).toBeVisible();
  await page.getByRole('button', { name: 'Send and extract' }).click();
  await expect.poll(() => ai.calls.extract).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page
    .getByLabel('Choose an image or PDF')
    .setInputFiles({ name: 'pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(materialPdf()) });
  await expect(page.getByLabel('Pages to send')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByRole('heading', { name: 'Review and correct' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Send and extract' }).click();
  await expect(page.getByRole('heading', { name: 'Review and correct' })).toBeVisible();
});

test('blockers cannot partially save; explicit exclusion and exercises/article destinations', async ({ page, ai }) => {
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
  await page.getByLabel('Save as', { exact: true }).selectOption('exercises');
  await chooseLevel(page, 'C1');
  await page.getByLabel('I have reviewed').check();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page.getByRole('status')).toContainText('resolve or exclude');
  await expect(page).toHaveURL(/#\/import$/);
  await page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Question illisible' }) })
    .locator('..')
    .getByRole('button', { name: 'Exclude', exact: true })
    .click();
  await page.getByLabel('I have reviewed').check();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page).toHaveURL(/#\/practice$/);
  expect((await savedRows(page)).units).toMatchObject([{ setTitle: 'Mon document', level: 'C1' }]);
  await page.goto('/#/import');
  ai.answer({ extract: { ...draftFixture, units: [] } });
  await extractText(page);
  await page.getByLabel('Save as', { exact: true }).selectOption('article');
  await page.getByLabel('I have reviewed').check();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page).toHaveURL(/#\/read\/material-/);
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
    navigate({ name: 'import' });
  });
  await page
    .getByLabel('Choose an image or PDF')
    .setInputFiles({ name: 'pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(materialPdf()) });
  await expect(page.getByText('This model cannot read images.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send and extract' })).toBeDisabled();
  expect(ai.calls.extract).toBe(1);
});
