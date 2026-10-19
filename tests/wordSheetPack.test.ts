/** Exercises the hook's module-import failure and next-open retry without a DOM; React effects/state are stepped explicitly. */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import * as React from 'react';
import { useWordSheetPack } from '../src/hooks/useWordSheetPack';
import { resetContentRequests } from '../src/services/grammarTopics/request';

beforeEach(() => resetContentRequests());
afterEach(() => {
  resetContentRequests();
  mock.restore();
});

test('a failed sections import settles with its real error, is cleared on close, and retries on reopen', async () => {
  let state: unknown;
  let effect: React.EffectCallback | undefined;
  const setState = (next: unknown) => {
    state = next;
  };
  spyOn(React, 'useState').mockImplementation((() => [state, setState]) as typeof React.useState);
  spyOn(React, 'useEffect').mockImplementation((next) => {
    effect = next;
  });
  void mock.module('../src/components/word/packSections', () => {
    throw new Error('sections chunk unavailable offline');
  });

  expect(useWordSheetPack(true, 'vais')).toBeUndefined();
  const close = effect!();
  await Bun.sleep(0);
  expect(useWordSheetPack(true, 'vais')).toEqual({ error: 'sections chunk unavailable offline' });
  if (typeof close === 'function') close();
  expect(state).toBeUndefined();
  expect(useWordSheetPack(false, null)).toBeUndefined();

  const load = mock(() => Promise.resolve());
  void mock.module('../src/components/word/packSections', () => ({
    loadedGrammarPack: () => undefined,
    loadGrammarPack: load,
    lexiconVerbLines: () => Promise.resolve({ lines: [] }),
  }));
  expect(useWordSheetPack(true, 'vais')).toBeUndefined();
  const cleanup = effect!();
  await Bun.sleep(0);
  expect(load).toHaveBeenCalledTimes(1);
  expect(useWordSheetPack(true, 'vais')?.sections).toBeDefined();
  if (typeof cleanup === 'function') cleanup();
});
