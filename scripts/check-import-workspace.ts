/** Actual production workspace under /app/: lazy PDF code and offline rendering, with AI mocked. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { materialPdf } from '../e2e/materialPdf';
import { draftFixture } from '../tests/fixtures/importDraft';
const outDir = path.resolve(import.meta.dirname, '../dist');
const server = Bun.serve({
  port: 5174,
  fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith('/app/')) return new Response('Not found', { status: 404 });
    const file = path.resolve(outDir, decodeURIComponent(pathname.slice(5)) || 'index.html');
    return file.startsWith(`${outDir}/`) ? new Response(Bun.file(file)) : new Response('Not found', { status: 404 });
  },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
  );
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('relire_onboarded', '1');
    localStorage.setItem('relire_app_settings_v1', JSON.stringify({ apiKeys: { gemini: 'TEST' } }));
  });
  let calls = 0;
  await context.route('**/*', async (route) => {
    if (route.request().url().startsWith('http://localhost:5174/')) return route.continue();
    if (!route.request().url().startsWith('https://generativelanguage.googleapis.com/')) return route.abort();
    calls++;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(draftFixture) }] } }] }),
    });
  });
  const page = await context.newPage();
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('http://localhost:5174/app/#/import/exercises?area=grammar');
  await page.getByLabel('Text to send').waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  assert(
    !(await page.evaluate(() =>
      performance.getEntriesByType('resource').some((entry) => entry.name.includes('/assets/importPdf-')),
    )),
    'PDF library must remain lazy',
  );
  console.log('PASS: actual production workspace loads without the PDF library');
  await context.setOffline(true);
  await page
    .getByLabel('Choose an image or PDF')
    .setInputFiles({ name: 'offline.pdf', mimeType: 'application/pdf', buffer: Buffer.from(materialPdf()) });
  await page.getByLabel('Pages to send').waitFor();
  await page.getByRole('button', { name: 'Send and extract' }).click();
  await page.getByRole('heading', { name: 'Review and correct' }).waitFor();
  assert.equal(calls, 1);
  assert(
    await page.evaluate(() =>
      performance.getEntriesByType('resource').some((entry) => entry.name.includes('/assets/importPdf-')),
    ),
  );
  assert.deepEqual(failures, []);
  console.log('PASS: offline /app/ actual PDF selection, lazy library/worker rendering and mocked extraction review');
  await context.close();
} finally {
  await browser?.close();
  await server.stop(true);
}
