/** Article import (Read): an image or PDF is read by the OCR task, pasted text uses no AI; one article is saved and opens in the Reader. */
import type { Page } from '@playwright/test';
import { test, expect, overflowing } from './fixtures';
import { materialPdf, tinyPng } from './materialPdf';

const TRANSCRIPTION = {
  title: 'Le renard et le prince',
  text: 'Le renard dit au petit prince : « On ne voit bien qu’avec le cœur. »\n\nIl fait déjà nuit.',
};

async function enter(page: Page) {
  await page.goto('/#/read');
  await page.getByRole('button', { name: 'Add article', exact: true }).click();
  await page.getByRole('button', { name: 'Import from image, PDF or text' }).click();
  await expect(page).toHaveURL(/#\/import\/article$/);
}

const savedRows = (page: Page) =>
  page.evaluate(async () => {
    const { db } = (await import('/src/storage/db.ts' as string)) as typeof import('../src/storage/db');
    const d = await db();
    return {
      articles: (await d.getAll('articles')).filter((row) => row.id.startsWith('import-')),
      units: await d.getAll('units'),
    };
  });

for (const phone of [false, true]) {
  test(`an image is read, reviewed and saved as an article that opens in the Reader ${phone ? '@phone' : ''}`, async ({
    page,
    ai,
  }) => {
    await page.addInitScript((theme) => localStorage.setItem('relire_theme', theme), phone ? 'dark' : 'sepia');
    ai.answer({ transcribe: TRANSCRIPTION });
    await enter(page);
    // This page has no extraction mode and says what is sent before anything is.
    await expect(page.getByLabel('Extraction mode')).toHaveCount(0);
    await expect(page.getByText('Pasted text is not sent anywhere.')).toBeVisible();
    await page.getByLabel('Choose an image or PDF').setInputFiles(tinyPng);
    await expect(page.getByText(/tiny.png · 1 page/)).toBeVisible();
    await expect(page.getByText('Recipient: Google Gemini · gemini-2.5-flash')).toBeVisible();
    expect(await overflowing(page.locator('body'))).toEqual([]);
    await page.getByRole('button', { name: 'Send and read' }).click();
    await expect(page.getByRole('heading', { name: 'Review the article' })).toBeVisible();
    expect(ai.calls.transcribe).toBe(1);
    expect(ai.calls.extract).toBe(0);
    expect(ai.prompts.transcribe[0]).toContain('Transcribe the attached images');
    await expect(page.getByLabel('Extraction mode')).toHaveCount(0);
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(TRANSCRIPTION.title);
    await expect(page.getByLabel('Article text')).toHaveValue(TRANSCRIPTION.text);
    expect(await overflowing(page.locator('body'))).toEqual([]);
    await page.getByLabel('Level', { exact: true }).selectOption('C1');
    await page.getByLabel('Article text').fill(`${TRANSCRIPTION.text}\n\nUne phrase corrigée.`);
    await page.getByRole('button', { name: 'Save article' }).click();
    await expect(page).toHaveURL(/#\/read\/import-[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: TRANSCRIPTION.title })).toBeVisible();
    await expect(page.locator('article [data-sentence]').first()).toContainText('Le renard dit');
    await expect(page.getByText('Une phrase corrigée.')).toBeVisible();
    const saved = await savedRows(page);
    expect(saved.articles).toHaveLength(1);
    expect(saved.articles[0]).toMatchObject({ title: TRANSCRIPTION.title, level: 'C1', source: 'tiny.png' });
    expect(saved.units).toEqual([]);
  });
}

test('pasted text makes no AI request and saves as an article', async ({ page, ai }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('generativelanguage')) requests.push(request.url());
  });
  await enter(page);
  // No text yet: nothing to continue with.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByLabel('Text to import').fill('Un texte collé.\n\nIl compte deux paragraphes.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Review the article' })).toBeVisible();
  await expect(page.getByLabel('Article text')).toHaveValue('Un texte collé.\n\nIl compte deux paragraphes.');
  // The title is empty (nothing invented) and required.
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save article' }).click();
  await expect(page.getByRole('status')).toContainText('Enter a title and some text');
  expect((await savedRows(page)).articles).toEqual([]);
  await page.getByLabel('Title', { exact: true }).fill('Mon texte');
  await page.getByRole('button', { name: 'Save article' }).click();
  await expect(page).toHaveURL(/#\/read\/import-[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Mon texte' })).toBeVisible();
  const saved = await savedRows(page);
  expect(saved.articles).toHaveLength(1);
  expect(saved.articles[0]).toMatchObject({
    title: 'Mon texte',
    level: 'B1',
    content: 'Un texte collé.\n\nIl compte deux paragraphes.',
  });
  expect(saved.articles[0].source).toBeUndefined();
  // Not one request reached the AI: the mock saw none and the page sent none.
  expect(Object.values(ai.calls).reduce((sum, count) => sum + count, 0)).toBe(0);
  expect(requests).toEqual([]);
});

test('a file and pasted text exclude each other, and neither is silently ignored', async ({ page, ai }) => {
  void ai;
  await enter(page);
  const text = page.getByLabel('Text to import');
  const file = page.getByLabel('Choose an image or PDF');
  await file.setInputFiles(tinyPng);
  await expect(page.getByText(/tiny.png · 1 page/)).toBeVisible();
  await expect(text).toBeDisabled();
  await page.getByRole('button', { name: 'Remove file' }).click();
  await expect(page.getByText(/tiny.png/)).toHaveCount(0);
  await expect(text).toBeEnabled();
  await text.fill('Du texte.');
  await expect(file).toBeDisabled();
  await text.fill('');
  await expect(file).toBeEnabled();
});

test('a PDF asks for pages and sends only the OCR request; a failed read shows the real reason and keeps the input', async ({
  page,
  ai,
}) => {
  ai.fail(['transcribe']);
  await enter(page);
  await page
    .getByLabel('Choose an image or PDF')
    .setInputFiles({ name: 'pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(materialPdf()) });
  await expect(page.getByLabel('Pages to send')).toBeVisible();
  await page.getByRole('button', { name: 'Send and read' }).click();
  await expect(page.getByRole('status')).toContainText('transcribe failed');
  await expect(page.getByRole('heading', { name: 'Review the article' })).toHaveCount(0);
  await expect(page.getByLabel('Pages to send')).toBeVisible();
  expect((await savedRows(page)).articles).toEqual([]);
  // Retrying after the provider recovers reads the same pages.
  ai.fail([]);
  ai.answer({ transcribe: TRANSCRIPTION });
  await page.getByRole('button', { name: 'Send and read' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(TRANSCRIPTION.title);
  expect(ai.calls.extract).toBe(0);
});

test('a dirty article import asks before leaving, and Start over discards the draft', async ({ page, ai }) => {
  void ai;
  await enter(page);
  await page.getByLabel('Text to import').fill('Texte non enregistré.');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard this import?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(/#\/import\/article$/);
  await expect(page.getByLabel('Text to import')).toHaveValue('Texte non enregistré.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Review the article' })).toBeVisible();
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByLabel('Text to import')).toHaveValue('');
  expect((await savedRows(page)).articles).toEqual([]);
});

test('each import is a sidebar entry of its own area, and the library and Practice link to them', async ({
  page,
  ai,
}) => {
  void ai;
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await page.goto('/#/read');
  await nav.getByRole('link', { name: 'Import an article', exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/article$/);
  await expect(nav.getByRole('link', { name: 'Import an article', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: 'Read', exact: true })).toHaveAttribute('aria-current', 'true');
  // The exercise import is not offered while in Read, and the old single address is gone.
  await expect(nav.getByRole('link', { name: 'Import exercises' })).toHaveCount(0);
  await page.goto('/#/practice');
  await expect(nav.getByRole('link', { name: 'Import an article' })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Import exercises', exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/exercises$/);
  await expect(nav.getByRole('link', { name: 'Import exercises', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: 'Practice', exact: true })).toHaveAttribute('aria-current', 'true');
  await page.goto('/#/import');
  await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
});
