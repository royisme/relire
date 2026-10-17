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
async function extractText(page: import('@playwright/test').Page) {
  await page.getByLabel('Text to send').fill(draftFixture.sourceText);
  await expect(page.getByText('Recipient: Google Gemini · gemini-2.5-flash')).toBeVisible();
  await page.getByRole('button', { name: 'Send and extract' }).click();
  await expect(page.getByRole('heading', { name: 'Review and correct' })).toBeVisible();
}
for (const phone of [false, true]) {
  test(`text review, blocker exclusion, one-material both and durable destination ${phone ? '@phone' : ''}`, async ({
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
    await expect(page).toHaveURL(/#\/practice\?article=material-/);
    const saved = await page.evaluate(async () => {
      const { db } = (await import(
        /* @vite-ignore */ '/src/storage/db.ts' as string
      )) as typeof import('../src/storage/db');
      const d = await db();
      return { articles: await d.getAll('articles'), units: await d.getAll('units') };
    });
    const rows = saved.articles.filter((row) => row.title === 'Imported workbook');
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('article');
    expect(saved.units.filter((unit) => unit.materialId === rows[0].id)).toHaveLength(1);
  });
}

test('failed atomic save keeps draft and guard, retry keeps prepared identities', async ({ page, ai }) => {
  ai.answer({ extract: draft() });
  await enter(page);
  await extractText(page);
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Invoked with its store below.
    const original = IDBObjectStore.prototype.add;
    (window as unknown as { restoreAdd: () => void }).restoreAdd = () => {
      IDBObjectStore.prototype.add = original;
    };
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === 'units') throw new Error('Storage test failure');
      return original.call(this, value, key);
    };
  });
  await page.getByLabel('I have reviewed').check();
  await page.getByRole('button', { name: 'Confirm and save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Storage test failure' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.evaluate(() => (window as unknown as { restoreAdd: () => void }).restoreAdd());
  await page.evaluate(async () => {
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    const tx = (await db()).transaction('articles', 'readwrite');
    const hold = () => {
      void tx.store.get('petit-prince').then(() => {
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
  await expect(page).toHaveURL(/#\/practice\?article=material-/);
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

test('blockers cannot partially save; explicit exclusion and article/workbook destinations', async ({ page, ai }) => {
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
  await expect(page).toHaveURL(/#\/practice\?article=material-/);
  const kind = await page.evaluate(async () => {
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    return (await (await db()).getAll('articles')).find((row) => row.title === 'Mon document')?.kind;
  });
  expect(kind).toBe('workbook');
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
  // All shipped Gemini text models accept images. Exercise the provider-neutral refusal without adding a fake provider.
  await page.getByRole('link', { name: 'Text AI settings' }).click();
  await page.evaluate(async () => {
    const { getTextProvider } = (await import(
      '/src/services/ai/providers/index.ts' as string
    )) as typeof import('../src/services/ai/providers');
    getTextProvider('gemini').supportsImageInput = () => false;
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
