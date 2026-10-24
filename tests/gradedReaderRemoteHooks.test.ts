/** Mount/retry/route races in reader service hooks using restorable seams; no DOM, network or production content. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as service from '../src/services/gradedReaders/service';
import * as edition from '../src/services/gradedReaders/edition';
import { useReaderCatalogue } from '../src/hooks/useReaderCatalogue';
import { useReaderEdition } from '../src/hooks/useReaderEdition';
import { publishedReaderFixture } from './fixtures/gradedReaders';
import { readerSummary } from '../src/services/gradedReaders/catalogue';
import { vocabularyHash } from '../src/services/vocabulary/book';

const reader = publishedReaderFixture();
const bundled = [reader];
const entry = await readerSummary(reader);
const body = { schemaVersion: 1 as const, syllabusVersion: '1.0.0', readers: [entry] };
const catalogue = { ...body, version: await vocabularyHash(body) };
const originalUrl = process.env.VITE_CONTENT_SERVICE_URL;
let restores: (() => void)[];
let slots: unknown[];
let cursor: number;
let effect: React.EffectCallback;
function render<T>(hook: () => T): T {
  cursor = 0;
  return hook();
}
const settle = () => Bun.sleep(0);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  process.env.VITE_CONTENT_SERVICE_URL = 'https://content.test';
  slots = [];
  effect = () => undefined;
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [
      slots[index],
      (next: unknown) => {
        slots[index] = typeof next === 'function' ? next(slots[index]) : next;
      },
    ];
  }) as typeof React.useState);
  const mount = spyOn(React, 'useEffect').mockImplementation((callback) => {
    effect = callback;
  });
  const callback = spyOn(React, 'useCallback').mockImplementation(((fn: unknown) => fn) as typeof React.useCallback);
  restores = [() => state.mockRestore(), () => mount.mockRestore(), () => callback.mockRestore()];
});
afterEach(() => {
  for (const restore of restores) restore();
  if (originalUrl === undefined) delete process.env.VITE_CONTENT_SERVICE_URL;
  else process.env.VITE_CONTENT_SERVICE_URL = originalUrl;
});

test('catalogue is disabled without a URL and never fetches', () => {
  delete process.env.VITE_CONTENT_SERVICE_URL;
  const load = spyOn(service, 'loadReaderCatalogue');
  restores.push(() => load.mockRestore());
  expect(render(() => useReaderCatalogue(bundled)).status).toBe('disabled');
  effect();
  expect(load).not.toHaveBeenCalled();
});

test('service readiness deduplicates starters, surfaces edition conflicts and labels a saved catalogue', async () => {
  const remote = { ...entry, id: 'test-remote', order: 2 };
  const load = spyOn(service, 'loadReaderCatalogue').mockResolvedValue({
    catalogue: { ...catalogue, readers: [{ ...entry, artifactHash: 'a'.repeat(64) }, remote] },
    saved: true,
  });
  restores.push(() => load.mockRestore());
  expect(render(() => useReaderCatalogue(bundled)).status).toBe('loading');
  effect();
  await settle();
  expect(render(() => useReaderCatalogue(bundled))).toMatchObject({
    status: 'ready',
    saved: true,
    readers: [remote],
    conflicts: [{ ...entry, artifactHash: 'a'.repeat(64) }],
  });
});

test('catalogue retry/unmount guard rejects late success and failure without disturbing the new list', async () => {
  const old = deferred<Awaited<ReturnType<typeof service.loadReaderCatalogue>>>();
  const load = spyOn(service, 'loadReaderCatalogue')
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValue({ catalogue, saved: false });
  restores.push(() => load.mockRestore());
  render(() => useReaderCatalogue(bundled));
  const cleanup = effect();
  render(() => useReaderCatalogue(bundled)).retry();
  cleanup?.();
  render(() => useReaderCatalogue(bundled));
  effect();
  await settle();
  old.reject(new Error('TEST stale catalogue'));
  await settle();
  expect(render(() => useReaderCatalogue(bundled))).toMatchObject({ status: 'ready', readers: [], saved: false });
  const late = deferred<Awaited<ReturnType<typeof service.loadReaderCatalogue>>>();
  load.mockImplementationOnce(() => late.promise);
  render(() => useReaderCatalogue(bundled)).retry();
  render(() => useReaderCatalogue(bundled));
  const unmount = effect();
  unmount?.();
  late.resolve({ catalogue, saved: true });
  await settle();
  expect(render(() => useReaderCatalogue(bundled)).status).toBe('loading');
});

test('catalogue shows real failure, retry returns to a bounded loading state', async () => {
  const load = spyOn(service, 'loadReaderCatalogue').mockRejectedValue(new Error('TEST HTTP 429'));
  restores.push(() => load.mockRestore());
  render(() => useReaderCatalogue(bundled));
  effect();
  await settle();
  expect(render(() => useReaderCatalogue(bundled))).toMatchObject({ status: 'error', error: 'TEST HTTP 429' });
  render(() => useReaderCatalogue(bundled)).retry();
  expect(render(() => useReaderCatalogue(bundled)).status).toBe('loading');
});

test('detail loading then not-found or real error; no fabricated reader', async () => {
  const load = spyOn(edition, 'resolveReaderEdition').mockResolvedValue(undefined);
  restores.push(() => load.mockRestore());
  expect(render(() => useReaderEdition('test-absent')).reader).toBeUndefined();
  effect();
  await settle();
  expect(render(() => useReaderEdition('test-absent')).missing).toBe(true);
  load.mockRejectedValueOnce(new Error('TEST offline not downloaded'));
  render(() => useReaderEdition('test-absent')).retry();
  render(() => useReaderEdition('test-absent'));
  effect();
  await settle();
  expect(render(() => useReaderEdition('test-absent'))).toMatchObject({ error: 'TEST offline not downloaded' });
});

test('route changes hide the old result immediately and drop overtaken or unmounted replies', async () => {
  const old = deferred<typeof reader | undefined>();
  const fresh = deferred<typeof reader | undefined>();
  const load = spyOn(edition, 'resolveReaderEdition')
    .mockImplementationOnce(() => old.promise)
    .mockImplementationOnce(() => fresh.promise);
  restores.push(() => load.mockRestore());
  render(() => useReaderEdition('test-old'));
  const cleanup = effect();
  expect(render(() => useReaderEdition('test-new')).reader).toBeUndefined();
  cleanup?.();
  effect();
  fresh.resolve(reader);
  await settle();
  expect(render(() => useReaderEdition('test-new')).reader).toEqual(reader);
  old.resolve(undefined);
  await settle();
  expect(render(() => useReaderEdition('test-new')).reader).toEqual(reader);
  expect(render(() => useReaderEdition('test-next')).reader).toBeUndefined();
});
