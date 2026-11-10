/** Mount-scoped starter readiness: loading to ready, error to retry, and the stale-session guard; validation stays in the loader tests. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { useGradedReaders } from '../src/hooks/useGradedReaders';
import * as starterReaders from '../src/services/gradedReaders/load';
import type { PublishedReader } from '../src/types/gradedReader';
import { publishedReaderFixture } from './fixtures/gradedReaders';

// The loader is the hook's only seam. A namespace spy is restorable, unlike mock.module, which would leak into the
// loader tests that share this process; named imports resolve through the namespace, so the hook sees the spy.
let load: ReturnType<typeof spyOn<typeof starterReaders, 'loadStarterReaders'>>;
let restoreHooks: (() => void)[] = [];

beforeEach(() => {
  load = spyOn(starterReaders, 'loadStarterReaders');
  load.mockImplementation(() => Promise.resolve([]));
  restoreHooks = hookHarness();
});
afterEach(() => {
  load.mockRestore();
  for (const restore of restoreHooks) restore();
  restoreHooks = [];
});

// Harness state slots: no DOM test environment is installed, so hooks are stepped by slot like
// tests/grammarTopicsHooks.test.ts and tests/exerciseUnitDraftRaces.test.ts do.
const statusSlot = { value: undefined as unknown };
const attemptSlot = { value: 0 };
let effect: React.EffectCallback;

function hookHarness() {
  statusSlot.value = { status: 'loading' };
  attemptSlot.value = 0;
  effect = () => undefined;
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const slot = typeof initial === 'number' ? attemptSlot : statusSlot;
    slot.value ??= typeof initial === 'function' ? initial() : initial;
    return [
      slot.value,
      (next: unknown) => {
        slot.value = typeof next === 'function' ? next(slot.value) : next;
      },
    ];
  }) as typeof React.useState);
  const mount = spyOn(React, 'useEffect').mockImplementation((callback: React.EffectCallback) => {
    effect = callback;
  });
  const callback = spyOn(React, 'useCallback').mockImplementation(((fn: unknown) => fn) as typeof React.useCallback);
  return [() => state.mockRestore(), () => mount.mockRestore(), () => callback.mockRestore()];
}

function deferredResult<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const settle = () => Bun.sleep(0);

const mockResolveOnce = (readers: PublishedReader[]) => load.mockImplementationOnce(() => Promise.resolve(readers));
const mockRejectOnce = (error: Error) => load.mockImplementationOnce(() => Promise.reject(error));
const mockDeferOnce = () => {
  const deferred = deferredResult<PublishedReader[]>();
  load.mockImplementationOnce(() => deferred.promise);
  return deferred;
};

test('the hook starts loading and becomes ready with the validated pack', async () => {
  const readers = [publishedReaderFixture()];
  mockResolveOnce(readers);
  expect(useGradedReaders()).toEqual({ status: 'loading', retry: expect.any(Function) });
  effect();
  await settle();
  expect(useGradedReaders()).toEqual({ status: 'ready', readers, retry: expect.any(Function) });
});

test('the hook shows the real load error and recovers on retry', async () => {
  mockRejectOnce(new Error('TEST starter chunk corrupt'));
  useGradedReaders();
  effect();
  await settle();
  expect(useGradedReaders()).toMatchObject({ status: 'error', error: 'TEST starter chunk corrupt' });
  const readers = [publishedReaderFixture()];
  mockResolveOnce(readers);
  const { retry } = useGradedReaders();
  retry();
  effect();
  await settle();
  expect(useGradedReaders()).toMatchObject({ status: 'ready', readers });
});

test('an overtaken load cannot overwrite the newer result that replaced it', async () => {
  const stale = mockDeferOnce();
  const fresh = mockDeferOnce();
  useGradedReaders();
  const firstCleanup = effect();
  const { retry } = useGradedReaders();
  retry();
  // React tears the first session down before running the retried one.
  firstCleanup?.();
  effect();
  const readers = [publishedReaderFixture()];
  fresh.resolve(readers);
  await settle();
  expect(useGradedReaders()).toMatchObject({ status: 'ready', readers });
  // The overtaken load settling late, either way, must leave the live session alone.
  stale.reject(new Error('TEST stale failure'));
  await settle();
  expect(useGradedReaders()).toMatchObject({ status: 'ready', readers });
});

test('a late success from an overtaken load does not replace the newer pack', async () => {
  const stale = mockDeferOnce();
  const fresh = mockDeferOnce();
  useGradedReaders();
  const firstCleanup = effect();
  const { retry } = useGradedReaders();
  retry();
  firstCleanup?.();
  effect();
  const readers = [publishedReaderFixture()];
  fresh.resolve(readers);
  await settle();
  stale.resolve([]);
  await settle();
  expect(useGradedReaders()).toMatchObject({ status: 'ready', readers });
});
