/** Mount-scoped spelling-pack loading, retry and stale completion guards; no network or browser. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import { useSpellingSounds } from '../src/hooks/useSpellingSounds';
import * as loader from '../src/services/spellingSounds/load';
import type { SpellingSoundsPack } from '../src/types/spellingSounds';
import { spellingPack } from './fixtures/spellingSounds';

let load: ReturnType<typeof spyOn<typeof loader, 'loadSpellingSoundsPack'>>;
let restores: (() => void)[];
let current: unknown;
let attempt = 0;
let effect: React.EffectCallback;
let dependencies: React.DependencyList | undefined;

beforeEach(() => {
  current = { status: 'loading' };
  attempt = 0;
  load = spyOn(loader, 'loadSpellingSoundsPack').mockResolvedValue(spellingPack());
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => [
    typeof initial === 'number' ? attempt : current,
    (next: unknown) => {
      if (typeof initial === 'number') attempt = typeof next === 'function' ? next(attempt) : next;
      else current = typeof next === 'function' ? next(current) : next;
    },
  ]) as typeof React.useState);
  const effects = spyOn(React, 'useEffect').mockImplementation((callback, deps) => {
    effect = callback;
    dependencies = deps;
  });
  const callback = spyOn(React, 'useCallback').mockImplementation(((fn: unknown) => fn) as typeof React.useCallback);
  restores = [
    () => load.mockRestore(),
    () => state.mockRestore(),
    () => effects.mockRestore(),
    () => callback.mockRestore(),
  ];
});
afterEach(() => {
  for (const restore of restores) restore();
});

function deferred() {
  let resolve!: (pack: SpellingSoundsPack) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<SpellingSoundsPack>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test('loads with no arguments, exposes the validated pack, and retries the real failure through loading', async () => {
  load.mockRejectedValueOnce(new Error('TEST spelling chunk corrupt'));
  expect(useSpellingSounds()).toMatchObject({ status: 'loading' });
  effect();
  await Bun.sleep(0);
  expect(load.mock.calls[0]).toEqual([]);
  expect(useSpellingSounds()).toMatchObject({ status: 'error', error: 'TEST spelling chunk corrupt' });
  const firstDependencies = dependencies;
  useSpellingSounds().retry();
  expect(useSpellingSounds()).toMatchObject({ status: 'loading' });
  expect(dependencies).not.toEqual(firstDependencies);
  effect();
  await Bun.sleep(0);
  expect(useSpellingSounds()).toMatchObject({ status: 'ready', pack: spellingPack() });
  expect(useSpellingSounds().error).toBeUndefined();
  expect(load).toHaveBeenCalledTimes(2);
});

for (const outcome of ['resolve', 'reject'] as const) {
  test(`an overtaken ${outcome} cannot replace the retry result`, async () => {
    const stale = deferred();
    const fresh = deferred();
    load.mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => fresh.promise);
    useSpellingSounds();
    const cleanup = effect() as () => void;
    useSpellingSounds().retry();
    cleanup();
    useSpellingSounds();
    effect();
    const pack = spellingPack();
    fresh.resolve(pack);
    await Bun.sleep(0);
    if (outcome === 'resolve') stale.resolve({ ...pack, packVersion: 'TEST stale' });
    else stale.reject(new Error('TEST stale failure'));
    await Bun.sleep(0);
    expect(useSpellingSounds()).toMatchObject({ status: 'ready', pack });
  });

  test(`unmount drops a late ${outcome}`, async () => {
    const pending = deferred();
    load.mockImplementationOnce(() => pending.promise);
    useSpellingSounds();
    const cleanup = effect() as () => void;
    cleanup();
    if (outcome === 'resolve') pending.resolve(spellingPack());
    else pending.reject(new Error('TEST unmounted failure'));
    await Bun.sleep(0);
    expect(current).toEqual({ status: 'loading' });
  });
}
