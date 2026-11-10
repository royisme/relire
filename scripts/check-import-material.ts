/** Installed-Chrome production smoke under /app/, including offline resources. No AI or screenshots. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { materialPdf, protectedMaterialPdf } from '../e2e/materialPdf';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'dist-material-test');
await build({
  configFile: path.join(root, 'vite.config.ts'),
  build: {
    outDir,
    rollupOptions: {
      input: { app: path.join(root, 'index.html'), materialHarness: path.join(root, 'material-test.html') },
    },
  },
});
const server = Bun.serve({
  port: 5174,
  fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/app/')) return new Response('Not found', { status: 404 });
    const relative = decodeURIComponent(url.pathname.slice('/app/'.length)) || 'index.html';
    const file = path.resolve(outDir, relative);
    if (!file.startsWith(`${outDir}/`)) return new Response('Not found', { status: 404 });
    return new Response(Bun.file(file));
  },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
  );
  const context = await browser.newContext();
  await context.route('**/*', (route) =>
    route.request().url().startsWith('http://localhost:5174/') ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  const requests: string[] = [];
  const failures: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('http://localhost:5174/app/material-test.html');
  await page.waitForFunction(() => Boolean(window.materials));
  assert(
    !requests.some((url) => /pdfjs|importPdf|pdf\.worker/.test(url)),
    'PDF.js must not load with the material service',
  );
  console.log('PASS: material service loads without PDF.js');
  const imageCheck = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'));
    const material = await window.materials.openMaterial(
      new File([blob], 'image.png', { type: 'image/png' }),
      new AbortController().signal,
    );
    const images = await material.render([1], new AbortController().signal);
    await material.dispose();
    let decodeError = '';
    try {
      await window.materials.openMaterial(
        new File(['bad'], 'bad.png', { type: 'image/png' }),
        new AbortController().signal,
      );
    } catch (error) {
      decodeError = (error as Error).message;
    }
    return { mime: images[0].mimeType, data: images[0].data, decodeError };
  });
  assert.equal(imageCheck.mime, 'image/png');
  assert(!imageCheck.data.startsWith('data:'));
  assert.match(imageCheck.decodeError, /could not be decoded/);
  assert(!requests.some((url) => /pdfjs|importPdf|pdf\.worker/.test(url)));
  console.log('PASS: images decode locally, damaged images rejected, PDF.js still not loaded');

  const result = await page.evaluate(async (pdf) => {
    const { openMaterial } = window.materials;
    const controller = new AbortController();
    const material = await openMaterial(new File([pdf], 'local.pdf', { type: 'application/pdf' }), controller.signal);
    const images = await material.render([1], controller.signal);
    const image = new Image();
    image.src = `data:${images[0].mimeType};base64,${images[0].data}`;
    await image.decode();
    const pixels = document.createElement('canvas');
    pixels.width = image.width;
    pixels.height = image.height;
    const ctx = pixels.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const colored = [...ctx.getImageData(50, 200, 1, 1).data];
    await material.dispose();
    await material.dispose();
    let closed = '';
    try {
      await material.render([1], controller.signal);
    } catch (error) {
      closed = (error as Error).name;
    }
    return {
      count: material.pageCount,
      width: image.width,
      height: image.height,
      prefix: images[0].data.slice(0, 5),
      mime: images[0].mimeType,
      colored,
      closed,
    };
  }, materialPdf());
  assert.equal(result.count, 1);
  assert.equal(result.width, 400);
  assert.equal(result.height, 400);
  assert.equal(result.mime, 'image/jpeg');
  assert(!result.prefix.startsWith('data:'));
  assert(result.colored[2] > result.colored[0], 'rendered page contains the blue rectangle');
  assert.equal(result.closed, 'AbortError');
  assert(requests.some((url) => url.includes('/app/pdfjs/pdf.worker.min.mjs')));
  assert(requests.some((url) => url.includes('/app/pdfjs/standard_fonts/')));
  assert(!requests.some((url) => new URL(url).pathname.startsWith('/pdfjs/')));
  console.log('PASS: real PDF rendered locally with worker/fonts under /app/, plain base64, disposal');

  const cancellation = await page.evaluate(async (pdf) => {
    const controller = new AbortController();
    const material = await window.materials.openMaterial(
      new File([pdf], 'cancel.pdf', { type: 'application/pdf' }),
      controller.signal,
    );
    const renderController = new AbortController();
    const prototype = HTMLCanvasElement.prototype;
    // Keep the original method unbound so it can be restored and called with each canvas.
    // eslint-disable-next-line typescript/unbound-method
    const original = prototype.getContext;
    const canvases: HTMLCanvasElement[] = [];
    prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      canvases.push(this);
      queueMicrotask(() => renderController.abort());
      return original.apply(this, args);
    } as typeof original;
    let name = '';
    try {
      await material.render([1], renderController.signal);
    } catch (error) {
      name = (error as Error).name;
    } finally {
      prototype.getContext = original;
    }
    const cleared = canvases.every((canvas) => canvas.width === 0 && canvas.height === 0);
    const retry = await material.render([1], controller.signal);
    controller.abort();
    await material.dispose();
    return { name, cleared, canvasCount: canvases.length, retry: retry.length };
  }, materialPdf());
  assert.equal(cancellation.name, 'AbortError');
  assert(cancellation.cleared && cancellation.canvasCount > 0);
  assert.equal(cancellation.retry, 1);
  console.log('PASS: cancellation during canvas rendering preserves AbortError, clears canvas, permits retry');

  const opening = await page.evaluate(async (pdf) => {
    const OriginalWorker = window.Worker;
    const controller = new AbortController();
    let workers = 0;
    let terminated = 0;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        workers++;
        queueMicrotask(() => controller.abort());
      }
      terminate() {
        terminated++;
        super.terminate();
      }
    };
    let name = '';
    try {
      await window.materials.openMaterial(
        new File([pdf], 'cancel.pdf', { type: 'application/pdf' }),
        controller.signal,
      );
    } catch (error) {
      name = (error as Error).name;
    } finally {
      window.Worker = OriginalWorker;
    }
    return { name, workers, terminated };
  }, materialPdf());
  assert.equal(opening.name, 'AbortError');
  assert.equal(opening.workers, 1);
  assert.equal(opening.terminated, 1);
  console.log('PASS: abort while opening destroys the real worker and preserves AbortError');

  const limits = await page.evaluate(async (pdf) => {
    try {
      await window.materials.openMaterial(
        new File([pdf], 'large.pdf', { type: 'application/pdf' }),
        new AbortController().signal,
      );
    } catch (error) {
      return (error as Error).message;
    }
    return '';
  }, materialPdf(101));
  assert.match(limits, /1–100/);
  console.log('PASS: actual 101-page PDF rejected');

  for (const password of ['secret', '']) {
    const protectedError = await page.evaluate(async (pdf) => {
      try {
        await window.materials.openMaterial(
          new File([pdf], 'protected.pdf', { type: 'application/pdf' }),
          new AbortController().signal,
        );
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    }, protectedMaterialPdf(password));
    assert.match(protectedError, /Protected PDFs/);
  }
  console.log('PASS: password-required and empty-user-password encrypted PDFs rejected without prompting');

  // Register the generated production SW and verify every shipped PDF resource is precached.
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null && Boolean(window.materials));
  await context.setOffline(true);
  const manifest = readFileSync(path.join(outDir, 'sw.js'), 'utf8');
  const resourcePaths = [...manifest.matchAll(/url:"(pdfjs\/[^"]+)"/g)].map((match) => match[1]);
  assert(resourcePaths.length > 100, 'production SW lists worker/cmaps/fonts/wasm');
  const offline = await page.evaluate(
    async ({ resources, pdf }) => {
      for (const resource of resources) {
        const response = await fetch(new URL(resource, location.href));
        if (!response.ok) throw new Error(`Offline resource missing: ${resource}`);
      }
      const controller = new AbortController();
      const material = await window.materials.openMaterial(
        new File([pdf], 'offline.pdf', { type: 'application/pdf' }),
        controller.signal,
      );
      const images = await material.render([1], controller.signal);
      await material.dispose();
      return images[0].data.length;
    },
    { resources: resourcePaths, pdf: materialPdf() },
  );
  assert(offline > 100);
  assert.deepEqual(failures, []);
  console.log(`PASS: offline /app/ PDF rendering and ${resourcePaths.length} precached PDF resources (harness build)`);
  await context.close();
} finally {
  await browser?.close();
  await server.stop(true);
  await Bun.$`rm -rf ${outDir}`.quiet();
}
